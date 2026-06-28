// 업무 · 일정 관리 — 백엔드 (Express + Postgres + Google 로그인)
// 정적 프론트(index.html 등)도 이 서버가 함께 서빙합니다. Railway 단일 서비스로 배포.
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { Pool } = require("pg");
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");

const PORT = process.env.PORT || 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const DATABASE_URL = process.env.DATABASE_URL || "";
const IS_PROD = process.env.NODE_ENV === "production";

const app = express();
app.use(express.json({ limit: "4mb" }));
app.use(cookieParser());

// Railway Postgres는 SSL 필요. 로컬(localhost)은 SSL 끄기.
const useSsl = DATABASE_URL && !/localhost|127\.0\.0\.1/.test(DATABASE_URL);
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
    { sub: user.sub, email: user.email, name: user.name },
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

function getUser(req) {
  const token = req.cookies && req.cookies.session;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function requireUser(req, res, next) {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  req.user = user;
  next();
}

// 프론트가 GIS 초기화에 쓸 클라이언트 ID + 동기화 가능 여부.
app.get("/api/config", (req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID, syncEnabled: Boolean(pool && GOOGLE_CLIENT_ID) });
});

// 임시 진단: DB 연결 상태 확인(자격증명은 노출 안 함).
app.get("/api/health", async (req, res) => {
  let host = null;
  try {
    host = DATABASE_URL ? new URL(DATABASE_URL).host : null;
  } catch {}
  if (!pool) return res.json({ pool: false, ssl: useSsl, host });
  try {
    await pool.query("SELECT 1");
    res.json({ pool: true, ssl: useSsl, host, db: "ok" });
  } catch (err) {
    res.json({ pool: true, ssl: useSsl, host, db: "error", message: err.message });
  }
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
    res.json({ user: { email: user.email, name: user.name } });
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
  const user = getUser(req);
  res.json({ user: user ? { email: user.email, name: user.name } : null });
});

// 사용자 보드 불러오기.
app.get("/api/board", requireUser, async (req, res) => {
  if (!pool) return res.status(503).json({ error: "db not configured" });
  try {
    const result = await pool.query("SELECT data FROM boards WHERE user_id = $1", [req.user.sub]);
    res.json({ board: result.rows[0] ? result.rows[0].data : null });
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
  try {
    await pool.query(
      `INSERT INTO boards (user_id, email, data, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE SET data = $3, email = $2, updated_at = now()`,
      [req.user.sub, req.user.email, board],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[board] save failed", err.message);
    res.status(500).json({ error: "save failed" });
  }
});

// 백엔드/설정 파일은 정적 서빙에서 제외 (프론트 자산만 노출).
const BLOCKED_STATIC = new Set([
  "/server.js",
  "/package.json",
  "/package-lock.json",
  "/.env",
  "/.env.example",
  "/.gitignore",
]);
app.use((req, res, next) => {
  if (BLOCKED_STATIC.has(req.path) || req.path.startsWith("/node_modules")) {
    return res.status(404).json({ error: "not found" });
  }
  next();
});

// 정적 프론트 서빙 (dotfiles 무시 → .env 등 비노출).
app.use(express.static(path.join(__dirname), { dotfiles: "ignore" }));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "not found" });
  res.sendFile(path.join(__dirname, "index.html"));
});

initDb().catch((err) => console.error("[db] init failed", err.message));
app.listen(PORT, () => console.log(`[server] listening on ${PORT}`));
