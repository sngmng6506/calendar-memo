// 업무 · 일정 관리 — 백엔드 (Express + Postgres + Google 로그인)
// 정적 프론트(index.html 등)도 이 서버가 함께 서빙합니다. Railway 단일 서비스로 배포.
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { Pool } = require("pg");
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const { getTodaySummary, getRangeSummary, energyMax, isDateKey } = require("./core/board-metrics");
const { normalizeBoard } = require("./core/board-schema");
const { loadHolidayScripts } = require("./core/load-holidays-node");

const PORT = process.env.PORT || 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const IS_PROD = process.env.NODE_ENV === "production";
const WIDGET_TOKEN_DAYS = 180;

// prod에서 JWT_SECRET 미설정 시 조용히 취약한 기본값으로 뜨지 않도록 기동 실패.
if (IS_PROD && !process.env.JWT_SECRET) {
  console.error("[fatal] JWT_SECRET must be set in production");
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

const app = express();
app.use(express.json({ limit: "4mb" }));
app.use(cookieParser());

try {
  const loaded = loadHolidayScripts();
  console.log(`[holidays] loaded ${loaded.length} file(s)`);
} catch (err) {
  console.error("[holidays] load failed", err.message);
}

function getPlanFeatures() {
  return {
    plan: "free",
    features: {
      manualSync: true,
      autoSync: false,
      widgetAutoRefresh: false,
    },
  };
}

// 공개 프록시(*.proxy.rlwy.net 등)는 SSL 필요. 로컬/Railway 내부망은 SSL 끄기.
const useSsl =
  Boolean(DATABASE_URL) && !/localhost|127\.0\.0\.1|\.railway\.internal/.test(DATABASE_URL);
const pool = DATABASE_URL
  ? new Pool({ connectionString: DATABASE_URL, ssl: useSsl ? { rejectUnauthorized: false } : false })
  : null;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

async function initDb() {
  if (!pool) {
    console.warn("[db] DATABASE_URL 미설정 — 동기화 비활성(프론트는 localStorage로 동작)");
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS boards (
      user_id TEXT PRIMARY KEY,
      email TEXT,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log("[db] ready");
}

function setSession(res, user) {
  const token = jwt.sign(
    { sub: user.sub, email: user.email, name: user.name, kind: "session" },
    JWT_SECRET,
    { expiresIn: "30d" },
  );
  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function getSessionUser(req) {
  const payload = verifyToken(req.cookies && req.cookies.session);
  if (!payload || payload.kind === "widget") return null;
  return payload;
}

function getBearerToken(req) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function getWidgetUser(req) {
  const sessionUser = getSessionUser(req);
  if (sessionUser) return { ...sessionUser, kind: "session", scopes: ["widget:read", "energy:write"] };

  const payload = verifyToken(getBearerToken(req));
  if (!payload || payload.kind !== "widget" || !Array.isArray(payload.scopes)) return null;
  return payload;
}

function requireUser(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  req.user = user;
  next();
}

function requireWidgetScope(scope) {
  return (req, res, next) => {
    const user = getWidgetUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    if (user.kind === "widget" && !user.scopes.includes(scope)) {
      return res.status(403).json({ error: "forbidden" });
    }
    req.user = user;
    next();
  };
}

const widgetOrigins = new Set([
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "http://localhost:1420",
  "http://127.0.0.1:1420",
]);

app.use("/api/widget", (req, res, next) => {
  const origin = req.get("origin");
  if (origin && widgetOrigins.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(origin && widgetOrigins.has(origin) ? 204 : 403);
  next();
});

// 프론트가 GIS 초기화에 쓸 클라이언트 ID + 동기화 가능 여부.
app.get("/api/config", (req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID, syncEnabled: Boolean(pool && GOOGLE_CLIENT_ID) });
});

// 구글 ID 토큰 검증 → 세션 발급.
app.post("/api/auth/google", async (req, res) => {
  try {
    const credential = req.body && req.body.credential;
    if (!credential) return res.status(400).json({ error: "missing credential" });
    if (!GOOGLE_CLIENT_ID) return res.status(500).json({ error: "google not configured" });
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const user = { sub: payload.sub, email: payload.email, name: payload.name };
    setSession(res, user);
    res.json({ user: { email: user.email, name: user.name }, ...getPlanFeatures(user) });
  } catch (err) {
    console.error("[auth] verify failed", err.message);
    res.status(401).json({ error: "invalid token" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("session");
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const user = getSessionUser(req);
  res.json({
    user: user ? { email: user.email, name: user.name } : null,
    ...getPlanFeatures(user),
  });
});

// 웹 세션으로만 발급 가능한 범위 제한 데스크톱 위젯 토큰.
app.post("/api/widget/token", requireUser, (req, res) => {
  const expiresInSeconds = WIDGET_TOKEN_DAYS * 24 * 60 * 60;
  const token = jwt.sign(
    {
      sub: req.user.sub,
      email: req.user.email,
      name: req.user.name,
      kind: "widget",
      scopes: ["widget:read", "energy:write"],
    },
    JWT_SECRET,
    { expiresIn: expiresInSeconds },
  );
  res.json({
    token,
    scopes: ["widget:read", "energy:write"],
    expiresAt: Date.now() + expiresInSeconds * 1000,
  });
});

// 사용자 보드 불러오기.
app.get("/api/board", requireUser, async (req, res) => {
  if (!pool) return res.status(503).json({ error: "db not configured" });
  try {
    const result = await pool.query(
      "SELECT data, updated_at FROM boards WHERE user_id = $1",
      [req.user.sub],
    );
    const row = result.rows[0];
    const updatedAt = row ? new Date(row.updated_at).getTime() : null;
    const normalized = row ? normalizeBoard(row.data) : null;
    if (normalized && updatedAt != null) normalized.updatedAt = updatedAt;
    res.json({ board: normalized, updatedAt });
  } catch (err) {
    console.error("[board] load failed", err.message);
    res.status(500).json({ error: "load failed" });
  }
});

// 사용자 보드 저장(업서트).
app.put("/api/board", requireUser, async (req, res) => {
  if (!pool) return res.status(503).json({ error: "db not configured" });
  const board = req.body && req.body.board;
  if (!board || typeof board !== "object") return res.status(400).json({ error: "invalid board" });
  const baseUpdatedAt = Number(req.body.baseUpdatedAt);
  const hasBase = Number.isFinite(baseUpdatedAt);
  const normalizedBoard = normalizeBoard(board);
  try {
    if (hasBase) {
      const current = await pool.query(
        "SELECT data, updated_at FROM boards WHERE user_id = $1",
        [req.user.sub],
      );
      const row = current.rows[0];
      if (row && new Date(row.updated_at).getTime() > baseUpdatedAt) {
        return res.status(409).json({
          error: "conflict",
          serverUpdatedAt: new Date(row.updated_at).getTime(),
          board: normalizeBoard(row.data ?? board),
        });
      }
    }
    const saved = await pool.query(
      `INSERT INTO boards (user_id, email, data, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE SET data = $3, email = $2, updated_at = now()
       RETURNING updated_at`,
      [req.user.sub, req.user.email, normalizedBoard],
    );
    res.json({ ok: true, updatedAt: new Date(saved.rows[0].updated_at).getTime() });
  } catch (err) {
    console.error("[board] save failed", err.message);
    res.status(500).json({ error: "save failed" });
  }
});

async function readUserBoard(userId) {
  const result = await pool.query("SELECT data, updated_at FROM boards WHERE user_id = $1", [userId]);
  const row = result.rows[0];
  return {
    board: row ? normalizeBoard(row.data) : normalizeBoard({}),
    updatedAt: row ? new Date(row.updated_at).getTime() : null,
  };
}

// Widget summary for small clients. 쿠키 세션 또는 위젯 Bearer 토큰 허용.
app.get("/api/widget/today", requireWidgetScope("widget:read"), async (req, res) => {
  if (!pool) return res.status(503).json({ error: "db not configured" });
  try {
    const { board, updatedAt } = await readUserBoard(req.user.sub);
    res.json({ summary: getTodaySummary(board, req.query.date), updatedAt });
  } catch (err) {
    console.error("[widget] today failed", err.message);
    res.status(500).json({ error: "widget summary failed" });
  }
});

app.get("/api/widget/range", requireWidgetScope("widget:read"), async (req, res) => {
  if (!pool) return res.status(503).json({ error: "db not configured" });
  try {
    const { board, updatedAt } = await readUserBoard(req.user.sub);
    res.json({ summary: getRangeSummary(board, req.query.start, req.query.days), updatedAt });
  } catch (err) {
    console.error("[widget] range failed", err.message);
    res.status(500).json({ error: "widget range failed" });
  }
});

// 데스크톱 위젯 quick-write: 보드 전체가 아니라 energy 필드 한 날짜만 원자적으로 병합.
app.patch("/api/widget/energy", requireWidgetScope("energy:write"), async (req, res) => {
  if (!pool) return res.status(503).json({ error: "db not configured" });
  const date = req.body && req.body.date;
  const value = Number(req.body && req.body.value);
  if (!isDateKey(date) || !Number.isFinite(value) || value < 0 || value > energyMax) {
    return res.status(400).json({ error: "invalid energy" });
  }

  const initialBoard = normalizeBoard({});
  initialBoard.energy[date] = value;

  try {
    const saved = await pool.query(
      `INSERT INTO boards (user_id, email, data, updated_at)
       VALUES ($1, $2, $5, now())
       ON CONFLICT (user_id) DO UPDATE SET
         email = EXCLUDED.email,
         data = jsonb_set(
           boards.data,
           '{energy}',
           (CASE
             WHEN jsonb_typeof(boards.data->'energy') = 'object' THEN boards.data->'energy'
             ELSE '{}'::jsonb
           END) || jsonb_build_object($3::text, to_jsonb($4::numeric)),
           true
         ),
         updated_at = now()
       RETURNING data, updated_at`,
      [req.user.sub, req.user.email, date, value, initialBoard],
    );
    const board = normalizeBoard(saved.rows[0].data);
    const updatedAt = new Date(saved.rows[0].updated_at).getTime();
    board.updatedAt = updatedAt;
    res.json({ ok: true, updatedAt, summary: getTodaySummary(board, date) });
  } catch (err) {
    console.error("[widget] energy save failed", err.message);
    res.status(500).json({ error: "energy save failed" });
  }
});

// 백엔드/설정/데스크톱 소스 파일은 정적 서빙에서 제외.
const BLOCKED_STATIC = new Set([
  "/server.js",
  "/package.json",
  "/package-lock.json",
  "/.env",
  "/.env.example",
  "/.gitignore",
]);
app.use((req, res, next) => {
  if (
    BLOCKED_STATIC.has(req.path) ||
    req.path.startsWith("/node_modules") ||
    req.path.startsWith("/desktop/") ||
    req.path.startsWith("/test/") ||
    req.path.startsWith("/scripts/")
  ) {
    return res.status(404).json({ error: "not found" });
  }
  next();
});

app.use(express.static(path.join(__dirname), { dotfiles: "ignore" }));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "not found" });
  res.sendFile(path.join(__dirname, "index.html"));
});

initDb().catch((err) => console.error("[db] init failed", err.message));
app.listen(PORT, () => console.log(`[server] listening on ${PORT}`));
