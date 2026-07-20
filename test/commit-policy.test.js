'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCommitMessage } = require('../scripts/check-commit-message.js');

const validMessage = `fix: preserve newer local edits

Why:
- Older remote deletions could remove a task edited later on another device.

Decision:
- Compare timestamps and apply a tombstone only when it is not stale.

Verification:
- Added conflict tests.`;

test('accepts a message with concrete Why and Decision sections', () => {
  assert.equal(validateCommitMessage(validMessage).valid, true);
});

test('accepts repository-specific Korean reasoning', () => {
  const result = validateCommitMessage(`fix: 저장 충돌 처리

Why:
- 오래된 저장 요청이 최신 메모를 덮어쓸 수 있었다.

Decision:
- 레코드 타임스탬프를 비교해 최신 상태만 유지한다.`);
  assert.equal(result.valid, true);
});

test('rejects a missing Why section', () => {
  const result = validateCommitMessage(`fix: preserve edits

Decision:
- Compare record timestamps before applying changes.`);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Why/);
});

test('rejects a missing Decision section', () => {
  const result = validateCommitMessage(`fix: preserve edits

Why:
- Stale requests could overwrite new task content.`);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Decision/);
});

test('rejects placeholders and empty instructional templates', () => {
  const result = validateCommitMessage(`chore: change policy

Why:
- TBD

Decision:
- N/A`);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /placeholder/);
});

test('rejects a section that only repeats the summary', () => {
  const result = validateCommitMessage(`fix: preserve newer local edits

Why:
- fix preserve newer local edits

Decision:
- Use record timestamps to resolve the conflict deterministically.`);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /repeating/);
});

test('ignores commented template guidance', () => {
  const result = validateCommitMessage(`# Summary guidance
fix: preserve edits

Why:
# explain why
- Stale requests could overwrite newer task content.

Decision:
# explain decision
- Compare timestamps before accepting an incoming record.`);
  assert.equal(result.valid, true);
});
