const { spawnSync } = require("node:child_process");

const files = [
  "app.js",
  "app-metrics-bridge.js",
  "server.js",
  "widget.js",
  "core/holiday-calendar.js",
  "core/load-holidays-node.js",
  "core/board-schema.js",
  "core/board-metrics.js",
  "desktop/widget-desktop.js",
];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
