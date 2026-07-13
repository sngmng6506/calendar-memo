const fs = require("fs");
const path = require("path");
const vm = require("vm");
const BoardCalendar = require("./holiday-calendar");

function loadHolidayScripts(directory = path.join(__dirname, "..", "holidays")) {
  if (!fs.existsSync(directory)) return [];

  const loaded = [];
  fs.readdirSync(directory)
    .filter((name) => /^\d{4}\.js$/.test(name))
    .sort()
    .forEach((name) => {
      const filename = path.join(directory, name);
      const source = fs.readFileSync(filename, "utf8");
      vm.runInNewContext(source, { registerHolidays: BoardCalendar.registerHolidays }, { filename });
      loaded.push(name);
    });

  return loaded;
}

module.exports = { loadHolidayScripts };
