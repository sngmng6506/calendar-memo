# Architecture

Daymark Ops Console is an Electron app with a small renderer-side page registry.

## Runtime

- `electron/main.js` owns the native window, JSON persistence, clipboard, and desktop-helper process calls.
- `electron/preload.js` exposes a narrow `window.daymark` API.
- `web/app.js` owns UI state, calendar rendering, task mutation, settings, and page routing.
- `web/styles.css` owns the terminal dashboard look.

## Extension Rule

Add new product areas as pages, not as extra controls in the calendar header.

Examples:

- `TODAY`: focused agenda and command queue
- `SIGNALS`: SNS, mail, and notification adapters
- `LOG`: completed work and activity history
- future `AI`: summaries and reasoning once the core app is stable

Each page should have a single render function and use the shared local store only through explicit helpers.
