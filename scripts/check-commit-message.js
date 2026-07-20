'use strict';

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const SECTION_HEADER = /^[A-Za-z][A-Za-z0-9 _-]*:\s*$/;
const PLACEHOLDER = /^(?:[-*]\s*)?(?:tbd|todo|n\/?a|none|nothing|later|placeholder|same as above|why|decision|fill(?: this)? in|not applicable)[.!]?$/i;
const MIN_REASON_LENGTH = 10;

function normalizeMessage(message) {
  return String(message || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
    .trim();
}

function sectionBody(lines, startIndex) {
  const body = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (SECTION_HEADER.test(lines[index].trim())) break;
    body.push(lines[index]);
  }
  return body;
}

function meaningfulText(lines) {
  return lines
    .map((line) => line.trim().replace(/^[-*]\s*/, ''))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedComparable(value) {
  return String(value || '')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function validateCommitMessage(message) {
  const normalized = normalizeMessage(message);
  const lines = normalized ? normalized.split('\n') : [];
  const errors = [];
  const title = (lines[0] || '').trim();

  if (!title) errors.push('A concise summary line is required.');
  if (title.length > 100) errors.push('The summary line must be 100 characters or fewer.');

  const whyIndex = lines.findIndex((line) => line.trim() === 'Why:');
  const decisionIndex = lines.findIndex((line) => line.trim() === 'Decision:');

  if (whyIndex === -1) errors.push('Add a `Why:` section.');
  if (decisionIndex === -1) errors.push('Add a `Decision:` section.');
  if (whyIndex !== -1 && decisionIndex !== -1 && whyIndex > decisionIndex) {
    errors.push('Place `Why:` before `Decision:`.');
  }

  const sections = [
    ['Why', whyIndex],
    ['Decision', decisionIndex]
  ];

  for (const [name, index] of sections) {
    if (index === -1) continue;
    const text = meaningfulText(sectionBody(lines, index));
    if (!text) {
      errors.push(`${name} must explain repository-specific reasoning.`);
      continue;
    }
    if (PLACEHOLDER.test(text)) {
      errors.push(`${name} cannot contain placeholder text such as TBD, N/A, or none.`);
      continue;
    }
    if ([...text].length < MIN_REASON_LENGTH) {
      errors.push(`${name} must contain at least ${MIN_REASON_LENGTH} meaningful characters.`);
    }
    if (title && normalizedComparable(text) === normalizedComparable(title)) {
      errors.push(`${name} must add reasoning instead of repeating the summary.`);
    }
  }

  return { valid: errors.length === 0, errors, title };
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function commitsInRange(base, head) {
  const hashes = git(['rev-list', '--reverse', `${base}..${head}`])
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

  return hashes.map((hash) => {
    const parents = git(['show', '-s', '--format=%P', hash]).trim().split(/\s+/).filter(Boolean);
    return {
      hash,
      isMerge: parents.length > 1,
      message: git(['show', '-s', '--format=%B', hash])
    };
  });
}

function validateRange(base, head) {
  const failures = [];
  for (const commit of commitsInRange(base, head)) {
    if (commit.isMerge) continue;
    const result = validateCommitMessage(commit.message);
    if (!result.valid) failures.push({ ...commit, ...result });
  }
  return failures;
}

function printFailure(label, result) {
  console.error(`\nCommit policy failed for ${label}:`);
  for (const error of result.errors) console.error(`  - ${error}`);
}

function main(argv = process.argv.slice(2)) {
  const [mode, ...args] = argv;

  if (mode === '--file' && args[0]) {
    const result = validateCommitMessage(fs.readFileSync(args[0], 'utf8'));
    if (!result.valid) {
      printFailure('the pending commit message', result);
      process.exitCode = 1;
    }
    return;
  }

  if (mode === '--range' && args[0] && args[1]) {
    const failures = validateRange(args[0], args[1]);
    if (failures.length) {
      for (const failure of failures) {
        const label = `${failure.hash.slice(0, 12)} ${failure.title || '(no summary)'}`;
        printFailure(label, failure);
      }
      console.error('\nSplit mixed work into logical commits, then rewrite invalid messages before merging.');
      process.exitCode = 1;
    } else {
      console.log(`Commit policy passed for ${args[0].slice(0, 12)}..${args[1].slice(0, 12)}.`);
    }
    return;
  }

  console.error('Usage:');
  console.error('  node scripts/check-commit-message.js --file <commit-message-file>');
  console.error('  node scripts/check-commit-message.js --range <base-sha> <head-sha>');
  process.exitCode = 2;
}

if (require.main === module) main();

module.exports = {
  commitsInRange,
  meaningfulText,
  normalizeMessage,
  validateCommitMessage,
  validateRange
};
