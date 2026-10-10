#!/usr/bin/env node
/**
 * FloodTwin AI — Build and Test Script
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const AI_DIR = path.join(PROJECT_ROOT, 'js', 'ai');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function runCommand(cmd, desc) {
  try {
    execSync(cmd, { stdio: 'pipe', cwd: PROJECT_ROOT });
    return true;
  } catch (e) {
    return false;
  }
}

log('╔════════════════════════════════════════════════════════════╗', 'cyan');
log('║      FloodTwin AI — Build & Test Script                  ║', 'cyan');
log('╚════════════════════════════════════════════════════════════╝', 'cyan');

let allPass = true;

log('\n📦 AI Modules:', 'cyan');
const files = fs.readdirSync(AI_DIR).filter(f => f.endsWith('.js'));
let totalLines = 0;
files.forEach(f => {
  const filePath = path.join(AI_DIR, f);
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').length;
  totalLines += lines;
  log(`  - ${f} (${lines} lines)`, 'reset');
});
log(`  Total: ${files.length} files, ${totalLines} lines`, 'yellow');

log('\n🔍 Syntax Check:', 'cyan');
files.forEach(f => {
  const filePath = path.join(AI_DIR, f);
  const result = runCommand(`node --check "${filePath}"`, f);
  if (result) {
    log(`  ✓ ${f}`, 'green');
  } else {
    log(`  ✗ ${f}`, 'red');
    allPass = false;
  }
});

log('\n📚 Documentation:', 'cyan');
const docs = [
  'README.md',
  'AI_ARCHITECTURE.md',
  'AI_ROADMAP.md',
  'docs/AI_ENHANCEMENT_REPORT.md',
  'js/ai/README.md'
];

docs.forEach(d => {
  const docPath = path.join(PROJECT_ROOT, d);
  if (fs.existsSync(docPath)) {
    const size = fs.statSync(docPath).size;
    log(`  ✓ ${d} (${Math.round(size/1024)} KB)`, 'green');
  } else {
    log(`  ✗ ${d} NOT FOUND`, 'red');
    allPass = false;
  }
});

log('\n🎮 Demo Files:', 'cyan');
const demoFiles = ['ai-demo.html'];
demoFiles.forEach(f => {
  const demoPath = path.join(PROJECT_ROOT, f);
  if (fs.existsSync(demoPath)) {
    log(`  ✓ ${f}`, 'green');
  } else {
    log(`  ✗ ${f} NOT FOUND`, 'red');
    allPass = false;
  }
});

if (allPass) {
  for (const [exe, args] of [[process.execPath, ['tests/audit-regressions.mjs']], ['python', ['tests/test_api.py']]]) {
    const result = require('node:child_process').spawnSync(exe, args, {cwd: PROJECT_ROOT, stdio: 'inherit'});
    if (result.status !== 0) allPass = false;
  }
}

log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
if (allPass) {
  log('║  ✓ ALL CHECKS PASSED                                      ║', 'green');
} else {
  log('║  ✗ SOME CHECKS FAILED                                    ║', 'red');
}
log('╚════════════════════════════════════════════════════════════╝', 'cyan');

log('\n📊 Summary:', 'cyan');
log(`  AI Modules: ${files.length} files`, 'reset');
log(`  Total Lines: ${totalLines} lines`, 'reset');
log(`  Documentation: ${docs.length} files`, 'reset');

log('\n🚀 To run the AI demo:', 'yellow');
log('  1. cd twin-demo', 'reset');
log('  2. python3 -m http.server 8000', 'reset');
log('  3. Open http://localhost:8000/ai-demo.html', 'reset');

process.exit(allPass ? 0 : 1);
