'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repositoryRoot = path.resolve(__dirname, '..');
const hookPath = path.join(repositoryRoot, '.githooks', 'commit-msg');

function runGit(args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function install() {
  try {
    const topLevel = path.resolve(runGit(['rev-parse', '--show-toplevel']));
    if (topLevel !== repositoryRoot) {
      console.warn('Skipping Git policy setup because the package is not installed from the repository root.');
      return;
    }

    runGit(['config', '--local', 'core.hooksPath', '.githooks']);
    runGit(['config', '--local', 'commit.template', '.gitmessage']);

    if (process.platform !== 'win32' && fs.existsSync(hookPath)) {
      fs.chmodSync(hookPath, 0o755);
    }

    console.log('Configured repository commit template and commit-msg hook.');
  } catch (error) {
    const detail = error?.stderr?.toString().trim() || error.message;
    console.warn(`Skipping Git policy setup: ${detail}`);
  }
}

if (require.main === module) install();

module.exports = { install };
