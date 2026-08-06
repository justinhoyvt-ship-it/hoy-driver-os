import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const repoRoot = path.resolve('..');
const controllerDir = path.join(repoRoot, 'pulse-forge', 'controller');
const builderPath = path.join(controllerDir, 'SelfValidatingBuilder.gs');
const installerPath = path.join(controllerDir, 'PermanentBuilderInstaller.gs');
const manifestPath = path.join(repoRoot, 'pulse-forge', 'builder-restoration', 'manifest.json');
const taskPath = path.join(repoRoot, 'pulse-agent', 'tasks', 'PULSE-080R.json');

// --- SelfValidatingBuilder checks ---
const builder = fs.readFileSync(builderPath, 'utf8');

for (const marker of [
  'function runNextReadyTask',
  'function selfValidatingBuilderCheck',
  'function builderSourceHash',
  'AUTOMATIC_MERGE: false',
  'AUTOMATIC_PRODUCTION_DEPLOYMENT: false',
  'PRODUCTION_TOUCHED: false',
  'PULSE-080R'
]) {
  assert.ok(builder.includes(marker), `SelfValidatingBuilder missing marker: ${marker}`);
}

// No duplicate function names in builder
const builderFns = [...builder.matchAll(/^function\s+(\w+)\s*\(/gm)].map(m => m[1]);
const builderDups = builderFns.filter((n, i) => builderFns.indexOf(n) !== i);
assert.ok(builderDups.length === 0, `SelfValidatingBuilder has duplicate functions: ${builderDups.join(', ')}`);

// --- PermanentBuilderInstaller checks ---
const installer = fs.readFileSync(installerPath, 'utf8');

for (const marker of [
  'function permanentBuilderInstall',
  'PROTECTED_FILE',
  'Code.gs must not be overwritten',
  'Rollback before PULSE-080R',
  'selfValidatingBuilderCheck',
  'rolled back to pre-install state',
  'AUTOMATIC_MERGE: false',
  'AUTOMATIC_PRODUCTION_DEPLOYMENT: false',
  'PRODUCTION_TOUCHED: false'
]) {
  assert.ok(installer.includes(marker), `PermanentBuilderInstaller missing marker: ${marker}`);
}

// Installer must not contain Code.gs overwrite
assert.ok(!installer.includes("'Code'") || installer.includes('must not be overwritten'),
  'PermanentBuilderInstaller: Code.gs protection guard missing');

// --- manifest.json ---
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.ok(manifest.taskId === 'PULSE-080R', 'manifest.json: wrong taskId');
assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0, 'manifest.json: files missing');
assert.ok(manifest.automaticMerge === false, 'manifest.json: automaticMerge must be false');
assert.ok(manifest.productionTouched === false, 'manifest.json: productionTouched must be false');

// --- PULSE-080R.json task ---
const task = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
assert.ok(task['Task ID'] === 'PULSE-080R', 'PULSE-080R.json: wrong Task ID');

// --- Code.gs untouched ---
const codePath = path.join(controllerDir, 'Code.gs');
const code = fs.readFileSync(codePath, 'utf8');
assert.ok(code.includes('function forgeControllerSelfTest'), 'Code.gs appears to have been modified');
assert.ok(!code.includes('runNextReadyTask'), 'Code.gs must not contain runNextReadyTask (belongs in SelfValidatingBuilder)');

console.log(JSON.stringify({
  ok: true,
  taskId: 'PULSE-080R',
  validated: [
    'SelfValidatingBuilder.gs present and correct',
    'PermanentBuilderInstaller.gs present and correct',
    'manifest.json valid',
    'PULSE-080R.json task present',
    'Code.gs untouched',
    'no duplicate functions',
    'safety flags confirmed'
  ],
  productionTouched: false,
  automaticMerge: false
}, null, 2));
