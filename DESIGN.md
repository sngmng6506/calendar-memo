# Design System

Daymark Ops Console uses a minimal high-density terminal dashboard style. Do not drift back toward liquid glass, marketing UI, large cards, or decorative gradients.

## Visual Direction

- Style: terminal-style operations dashboard
- Mood: compact, quiet, technical, fast to scan
- Primary screen: calendar grid + right inspector
- Avoid: hero sections, rounded card stacks, large decorative blobs, glossy buttons, oversized typography
- Use English command labels for the terminal feel: `CALENDAR`, `TODAY`, `SIGNALS`, `LOG`, `COMMANDS`, `COMPLETE ALL OPEN`

## Color Tokens

Use the CSS variables in `web/styles.css` as the source of truth.

```css
--bg: #050608;
--panel: rgba(8, 11, 14, 0.78);
--panel-strong: rgba(10, 14, 18, 0.92);
--line: rgba(138, 255, 211, 0.16);
--line-strong: rgba(138, 255, 211, 0.36);
--text: #d7f7ee;
--muted: rgba(215, 247, 238, 0.56);
--faint: rgba(215, 247, 238, 0.30);
--accent: #8affd3;
--clock-d1: rgba(138, 255, 211, 0.18);
--clock-d2: rgba(138, 255, 211, 0.38);
--clock-d3: rgba(138, 255, 211, 0.66);
--clock-d4: #8affd3;
--clock-avg: rgba(215, 247, 238, 0.20);
--cyan: #78d7ff;
--warn: #ffd166;
--danger: #ff6b7a;
--done: #7cffb2;
```

Rules:

- `--accent` is for active tabs, selected command states, and key identifiers.
- `--line` and `--line-strong` define the grid and panel edges.
- `--text` must remain readable regardless of background opacity.
- Completed tasks use muted green and line-through.
- Do not introduce a new dominant hue without updating this file.

## Typography

Font stack:

```css
"Cascadia Mono", "JetBrains Mono", "D2Coding", Consolas, monospace
```

Sizes:

- Top status / tabs / buttons: `11px`
- Calendar day number: `12px`
- Task preview: `11px`
- Task editor input: `12px`
- Inspector body: `12px`
- Panel heading: `16px`
- Eyebrow labels: `10px`, uppercase-style text

Rules:

- Do not use viewport-scaled font sizes.
- Do not use negative letter spacing.
- Keep labels short and scannable.
- Prefer compact text over explanatory in-app paragraphs.

## Layout

App shell:

- Full viewport Electron window.
- Topbar: clock, page tabs, drag handle, window actions.
- Status strip: compact metrics.
- Workspace: main calendar panel + right inspector.
- Right inspector width: `320px` unless there is a concrete reason to change it.

Calendar:

- Always render a 7 x 6 grid.
- Day cells must not grow with task count.
- Overflowing tasks scroll inside the day cell.
- Calendar day cells are for selection, display, and drag/drop only.
- Editing happens in `SELECTED TASKS` in the inspector.

Inspector:

- Shows selected date metrics, commands, and editable tasks.
- Task completion/editing/addition happens here.
- Keep command buttons full-width and terminal-like.

## Interaction Rules

Calendar:

- Click a date to select it.
- Arrow keys move by current grid position:
  - Left/right: previous/next day
  - Up/down: previous/next week
- Keep the current 6-week grid visible while the selected date is inside it.
- Change month only when selection moves outside the visible grid.
- Drag a task onto another date to move it.

Selected Tasks:

- Check targets must be easy to click; keep at least `42px x 28px` for the check control.
- `COMPLETE ALL OPEN` completes all unfinished tasks on the selected date.
- Emptying a task input removes that task.
- Enter commits edits or creates a new task.

Window:

- Frame is custom and borderless.
- Topbar/drag handle must remain draggable.
- Buttons, tabs, inputs, and command controls must be `no-drag`.
- Window mode should support minimize, maximize/restore, and close.
- Desktop mode may disable normal movement/resizing.

## Scrollbars

All scrollbars should match the terminal UI:

- Thin scrollbar.
- Transparent track.
- Muted accent thumb.
- Slightly brighter thumb on hover.
- No default bright browser scrollbar should remain visible.

## Task Description

- Each task may have an optional description field.
- Description appears below the task title, indented by one level.
- Use compact textarea styling, not large note cards.
- Calendar day cells still show title previews only; detailed editing belongs in the inspector or TODAY page.

## Analytics

- ANALYTICS tracks local usage and task completion only.
- Initial layout: a 2x2 quadrant dashboard with no right inspector.
- First quadrant: 24-hour circular active-time clock.
- Other three quadrants can remain reserved until the metric is worth adding.
- Keep metrics compact and line/grid based.
- Do not add AI interpretation here until the base data is reliable.

## Signals Inbox

- SIGNALS is an app-notification inbox, not a social feed.
- Start with manual capture: source, title, url, note, status.
- Status values: INBOX, SENT_TO_TODAY, DISMISSED.
- Core actions: TODAY, DISMISS, COPY URL.
- Future connectors should write into the same signals store array.
- Keep the page line-based and terminal-like.

## Page Architecture

Add new pages through `pageRegistry` in `web/app.js`.

```js
const pageRegistry = [
  { id: 'calendar', label: 'CALENDAR', render: renderCalendarPage },
  { id: 'today', label: 'TODAY', render: renderTodayPage },
  { id: 'signals', label: 'SIGNALS', render: renderSignalsPage },
  { id: 'log', label: 'LOG', render: renderLogPage }
];
```

Rules:

- Do not overload the calendar page with SNS or AI features.
- Put SNS, mail, and notification integrations under `SIGNALS`.
- Put daily execution workflow under `TODAY`.
- Put history and completed work under `LOG`.
- Add AI later as its own module after the base workflow is stable.

## Verification

Before handing off UI changes:

```powershell
npm run check
```

For iterative design work:

```powershell
npm run dev
```






