import { addDays, isoDate } from './utils.js';
import { addTask } from './tasks.js';

const SEED_VERSION = '2026-07-dashboard-demo-05';
const BIN_COUNT = 96;
const BIN_MINUTES = 15;

const taskTemplates = [
  {
    offset: -3,
    items: [
      ['Invoice review', true, '  \u2022 compare vendor totals\n  \u2022 mark follow-up items'],
      ['Refactor calendar key handling', true, '  \u2022 verify arrow navigation\n  \u2022 keep inspector focus stable'],
      ['Draft analytics notes', false, '  \u2022 active clock density\n  \u2022 daily summary ideas']
    ]
  },
  {
    offset: -2,
    items: [
      ['Prepare SNS connector map', true, '  \u2022 GitHub\n  \u2022 Mail\n  \u2022 Calendar'],
      ['Clean dashboard copy', false, '  \u2022 remove duplicate labels\n  \u2022 keep terminal tone'],
      ['Review desktop helper behavior', false, '  \u2022 WorkerW fallback\n  \u2022 window mode restore']
    ]
  },
  {
    offset: -1,
    items: [
      ['Finalize today description UX', true, '  \u2022 tab indent\n  \u2022 enter continues bullet'],
      ['Check maximized window bounds', true, '  \u2022 right edge\n  \u2022 transparent margin'],
      ['Collect log event candidates', false, '  \u2022 task create\n  \u2022 task complete\n  \u2022 signal triage']
    ]
  },
  {
    offset: 0,
    items: [
      ['Ship calendar and today polish', false, '  \u2022 run check\n  \u2022 inspect hotkeys'],
      ['Design LOG section MVP', false, '  \u2022 event schema\n  \u2022 terminal list\n  \u2022 filters later'],
      ['Triage SIGNAL inbox examples', false, '  \u2022 convert useful items to today\n  \u2022 dismiss noise'],
      ['Active Clock visual pass', true, '  \u2022 larger graph\n  \u2022 no R text']
    ]
  },
  {
    offset: 1,
    items: [
      ['Sketch analytics empty panels', false, '  \u2022 weekly active time\n  \u2022 completion trend'],
      ['Prepare GitHub notification adapter', false, '  \u2022 required scopes\n  \u2022 polling cadence']
    ]
  },
  {
    offset: 3,
    items: [
      ['Weekly dashboard review', false, '  \u2022 prune tasks\n  \u2022 move stale work'],
      ['Decide next connector', false, '  \u2022 GitHub vs Calendar vs RSS']
    ]
  }
];

const signalTemplates = [
  ['GitHub', 'PR review requested: desktop-dashboard#12', 'https://github.com/sngmng6506/desktop-dashboard/pull/12', 'Check renderer module split before merge.', 'INBOX', -35],
  ['Mail', 'Invoice from Design Vendor', '', 'Due Friday. Attach to finance task if needed.', 'INBOX', -58],
  ['Calendar', 'Client sync moved to 15:30', '', 'Update preparation task and notes.', 'INBOX', -92],
  ['RSS', 'Electron release note digest', 'https://www.electronjs.org/blog', 'Scan for window behavior changes.', 'DISMISSED', -140],
  ['Slack', 'Ops channel mentioned analytics panel', '', 'Converted to today follow-up.', 'SENT_TO_TODAY', -210]
];

export function seedDemoData(store) {
  store.settings ||= {};
  const now = new Date();
  store.tasks ||= [];
  store.signals ||= [];
  store.analytics ||= { days: {} };
  store.analytics.days ||= {};

  store.tasks = store.tasks.filter((task) => !String(task.seedVersion || '').startsWith('2026-07-dashboard-demo-'));
  store.signals = store.signals.filter((signal) => !String(signal.seedVersion || '').startsWith('2026-07-dashboard-demo-'));

  for (const group of taskTemplates) {
    const day = isoDate(addDays(now, group.offset));
    group.items.forEach(([content, completed, description], index) => {
      addTask(store, day, content, null, description, description ? 52 + description.split('\n').length * 18 : 0);
      const task = store.tasks.at(-1);
      task.completed = completed;
      task.seedVersion = SEED_VERSION;
      task.createdAt = dateWithOffset(now, group.offset, 9 + index, 10 + index * 7);
      task.updatedAt = dateWithOffset(now, group.offset, 11 + index, 15 + index * 3);
    });
  }

  signalTemplates.forEach(([source, title, url, note, status, minutesAgo]) => {
    store.signals.push({
      id: crypto.randomUUID(),
      source,
      title,
      url,
      note,
      status,
      seedVersion: SEED_VERSION,
      createdAt: new Date(now.getTime() + minutesAgo * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() + minutesAgo * 60 * 1000).toISOString()
    });
  });

  seedAnalytics(store, now);
  store.settings.demoSeedVersion = SEED_VERSION;
  return true;
}

function seedAnalytics(store, now) {
  for (let offset = -13; offset <= 0; offset += 1) {
    const date = addDays(now, offset);
    const day = isoDate(date);
    const hours = Array.from({ length: 24 }, () => 0);
    const bins15 = Array.from({ length: BIN_COUNT }, () => 0);
    const age = Math.abs(offset);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const drift = ((age % 3) - 1) * 15;
    const intensity = 0.9 + (age % 4) * 0.12;

    if (weekend) {
      addPulsePattern(bins15, [
        [11, 0 + drift, 70, 0.90],
        [15, 15 - drift, 92, 1.00],
        [22, 0, 38, 0.38]
      ], intensity);
    } else {
      addPulsePattern(bins15, [
        [8, 45 + drift, 42, 0.46],
        [9, 30 + drift, 118, 1.00],
        [10, 15 + drift, 132, 1.10],
        [11, 15 + drift, 54, 0.50],
        [13, 45 - drift, 46, 0.42],
        [14, 30 - drift, 148, 1.18],
        [15, 15 - drift, 126, 1.02],
        [16, 15 - drift, 62, 0.54],
        [21, 0 + drift, age % 2 === 0 ? 54 : 18, 0.32]
      ], intensity);
    }

    if (offset === 0) {
      addPulsePattern(bins15, [
        [10, 15, 170, 1.12],
        [14, 45, 150, 1.00],
        [16, 0, 86, 0.58]
      ], 1.12);
    }

    bins15.forEach((seconds, index) => hours[Math.floor(index / 4)] += seconds);

    store.analytics.days[day] = {
      activeSeconds: bins15.reduce((sum, seconds) => sum + seconds, 0),
      hours,
      bins15,
      lastSeenAt: dateWithOffset(now, offset, 21, 30)
    };
  }
}
function addPulsePattern(bins15, pulses, intensity) {
  pulses.forEach(([hour, minute, seconds, weight]) => {
    addClockRun(bins15, hour, minute, Math.round(seconds * 60 * weight * intensity));
  });
}
function addClockRun(bins15, hour, minute, seconds) {
  const totalMinutes = Math.max(0, Math.min((24 * 60) - BIN_MINUTES, hour * 60 + minute));
  const start = Math.floor(totalMinutes / BIN_MINUTES);
  const slots = Math.max(1, Math.ceil(seconds / (BIN_MINUTES * 60)));
  for (let index = 0; index < slots && start + index < bins15.length; index += 1) {
    bins15[start + index] += Math.round(seconds / slots);
  }
}

function dateWithOffset(now, dayOffset, hour, minute) {
  const date = addDays(now, dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}