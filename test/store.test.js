'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { createStoreManager } = require('../electron/store');

async function tempDir(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'daymark-store-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

function manager(directory) {
  return createStoreManager({
    fs,
    dataDir: directory,
    defaultSettings: { windowOpacity: 0.86 },
    now: () => new Date('2026-07-20T10:00:00.000Z'),
    logger: { error() {} }
  });
}

test('corrupted primary data is preserved and a valid backup is restored', async (t) => {
  const directory = await tempDir(t);
  const primary = path.join(directory, 'daymark-store.json');
  const backup = `${primary}.bak`;
  await fs.writeFile(primary, '{broken', 'utf8');
  await fs.writeFile(backup, JSON.stringify({
    tasks: [{ id: 'safe', content: 'from backup', updatedAt: '2026-07-20T09:00:00.000Z' }],
    settings: {}
  }), 'utf8');

  const loaded = await manager(directory).load();
  assert.equal(loaded.tasks[0].content, 'from backup');
  const files = await fs.readdir(directory);
  assert.ok(files.some((name) => name.includes('.corrupted-')));
});

test('queued stale snapshots are merged instead of dropping records', async (t) => {
  const directory = await tempDir(t);
  const storeManager = manager(directory);
  const initial = await storeManager.load();
  const first = structuredClone(initial);
  first.tasks.push({ id: 'a', content: 'A', updatedAt: '2026-07-20T10:00:01.000Z' });
  const second = structuredClone(initial);
  second.tasks.push({ id: 'b', content: 'B', updatedAt: '2026-07-20T10:00:02.000Z' });

  await Promise.all([storeManager.save(first), storeManager.save(second)]);
  const saved = await storeManager.load();
  assert.deepEqual(saved.tasks.map((task) => task.id).sort(), ['a', 'b']);
});

test('saving creates a backup and leaves no temporary file', async (t) => {
  const directory = await tempDir(t);
  const storeManager = manager(directory);
  const initial = await storeManager.load();
  initial.settings.windowOpacity = 0.5;
  await storeManager.save(initial);
  initial.settings.windowOpacity = 0.6;
  await storeManager.save(initial);

  const files = await fs.readdir(directory);
  assert.ok(files.includes('daymark-store.json.bak'));
  assert.equal(files.some((name) => name.includes('.tmp-')), false);
});
