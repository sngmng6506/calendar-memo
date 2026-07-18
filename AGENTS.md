# AGENTS.md

Daymark Ops Console is now an Electron-first desktop app. The active product direction is a terminal-style calendar dashboard with future pages for SNS, logs, and later AI.

## Working Rules

- Keep changes small and directly tied to the request.
- Preserve the terminal dashboard direction unless the user explicitly pivots again.
- Do not reintroduce Python/Tkinter UI paths.
- Do not add AI features until the base UX and extension pages are stable.
- Keep new product areas as separate pages in `web/app.js` page registry.
- Do not commit unless the user explicitly asks.

## Verification

Use:

```powershell
npm run check
```

For local launch:

```powershell
npm run start
```

For Windows desktop helper after .NET SDK is installed:

```powershell
npm run build:desktop-host
```
