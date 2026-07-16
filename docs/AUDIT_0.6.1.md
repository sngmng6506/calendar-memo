# v0.6.1 strict audit

## Reproduced defects fixed

1. Pressing Enter repeatedly on an existing task accumulated invisible draft rows.
   - Decision: keep exactly one draft row and reposition it after the edited task.
2. If the split backdrop failed after the foreground attached to WorkerW, the foreground remained attached while the app reported window mode.
   - Decision: detach both desktop surfaces before every failure fallback.
3. A backdrop maintenance failure disabled desktop mode without detaching either surface.
   - Decision: use the same two-surface rollback path for attach, maintain, and settings failures.
4. Closing the AI report or the app during generation caused Tk callbacks from the worker thread to target destroyed widgets.
   - Decision: workers only write to a queue; the Tk main thread polls and owns all widget updates.
5. Unexpected endpoint or response errors could leave the report UI permanently in `생성 중…`.
   - Decision: wrap malformed URLs/JSON/content and restore controls for every worker exception.
6. Rapid opacity preview scheduled unbounded delayed alpha callbacks.
   - Decision: debounce delayed alpha reapplication to at most two jobs.

## Verification

- 56 automated tests pass.
- Repeated month changes, 80-task day-cell entry, repeated edits, and 100 opacity preview changes complete without Tk callback errors.
- SQLite `PRAGMA integrity_check` returns `ok` after multi-day task creation and carry-over.
- Wheel packaging includes the 2020–2050 holiday fallback data.

## Remaining platform risks

These require a real Windows session and are not claimed as verified by the Linux audit environment:

- WorkerW variants across Windows 10/11 and Explorer updates.
- Mixed-DPI monitor coordinate behavior.
- Mouse hit-testing through the transparent-color foreground window, especially blank areas inside task rows and toolbar controls.
- Detach failure caused by an already-destroyed Explorer parent.
