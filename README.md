# Daymark Ops Console

Daymark is now an Electron desktop dashboard with a terminal-style calendar-first workflow.

The old Python/Tkinter UI and AI report flow have been removed from the active project direction. AI and SNS integrations can be added later as separate pages after the base dashboard design is stable.

## Current Direction

- Electron + Web UI is the main app.
- First page: high-density calendar and task board.
- TODAY page: today's tasks with editable indented descriptions.
- Task descriptions: optional indented detail text under each task.
- SIGNALS page: manual app-notification inbox that can later receive GitHub, Mail, Calendar, RSS, or other connector events.
- ANALYTICS page: 2x2 dashboard; first panel shows a 24-hour active-time clock, remaining panels are reserved.
- Future pages: `TODAY`, `SIGNALS`, `LOG` modules.
- AI is intentionally disabled for now.
- Windows desktop mode uses a small C# helper executable.
- Data is stored locally as JSON under Electron `userData`.

## Run

```powershell
cd C:\Users\ThinkPadX1\desktop\proj9\calendar-memo
npm install
npm run start
```

The app can also be started through the wrapper script:

```powershell
.\scripts\run.ps1
```

## Desktop Mode

The app can attach behind desktop icons through `daymark-desktop-host.exe`.

Build it after the .NET SDK is installed:

```powershell
npm run build:desktop-host
npm run start
```

If the helper is missing, the app still runs normally as a window. The `DESKTOP` button will show a failure message until the helper is built.

## Check

```powershell
npm run check
```

or:

```powershell
.\scripts\check.ps1
```

## Structure

```text
electron/
  main.js        Electron main process, local store, desktop helper bridge
  preload.js     Safe renderer API bridge

web/
  index.html     App shell
  styles.css     Terminal dashboard styling
  app.js         Page registry, calendar page, task state

tools/daymark-desktop-host/
  Program.cs     Windows WorkerW helper source

scripts/
  run.ps1                  Start Electron app
  check.ps1                JavaScript syntax check
  build-desktop-host.ps1   Build C# desktop helper
```

## Page Pattern

New pages are registered in `web/app.js` through `pageRegistry`:

```js
const pageRegistry = [
  { id: 'calendar', label: 'CALENDAR', render: renderCalendarPage },
  { id: 'today', label: 'TODAY', render: renderTodayPage },
  { id: 'signals', label: 'SIGNALS', render: renderSignalsPage },
  { id: 'log', label: 'LOG', render: renderLogPage }
];
```

This keeps SNS, notification, and AI features isolated as modules instead of mixing them into the calendar screen.





