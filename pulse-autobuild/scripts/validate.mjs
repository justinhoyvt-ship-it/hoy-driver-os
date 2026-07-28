import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const runtime = path.resolve('runtime');
const codePath = path.join(runtime, 'Code.gs');
const manifestPath = path.join(runtime, 'appsscript.json');
const repoRoot = path.resolve('..');
const builderDir = path.join(repoRoot, 'pulse-agent', 'builder');
const builderCodePath = path.join(builderDir, 'SelfValidatingBuilder.gs');
const builderContractPath = path.join(builderDir, 'self-validation-contract.json');
const builderReadmePath = path.join(builderDir, 'README.md');
const builderRollbackPath = path.join(builderDir, 'ROLLBACK.md');
const builderTaskPath = path.join(repoRoot, 'pulse-agent', 'tasks', 'PULSE-066.json');
const driverDir = path.join(repoRoot, 'apps-script', 'hoy-driver-os-writer');
const driverCodePath = path.join(driverDir, 'Code.gs');
const driverIndexPath = path.join(driverDir, 'Index.html');
const driverReadmePath = path.join(driverDir, 'README.md');
const problems = [];
const builderProblems = [];

if (!fs.existsSync(codePath)) problems.push('Missing runtime/Code.gs');
if (!fs.existsSync(manifestPath)) problems.push('Missing runtime/appsscript.json');

const source = fs.existsSync(codePath) ? fs.readFileSync(codePath, 'utf8') : '';
try {
  new vm.Script(source, { filename: 'runtime/Code.gs' });
} catch (error) {
  problems.push(`Code.gs syntax error: ${error.message}`);
}

let manifest = {};
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
  problems.push(`Manifest error: ${error.message}`);
}

const scopes = manifest.oauthScopes || [];
const allowedScopes = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/script.external_request'
];
for (const scope of scopes) {
  if (!allowedScopes.includes(scope)) problems.push(`Forbidden OAuth scope: ${scope}`);
}
for (const scope of allowedScopes) {
  if (!scopes.includes(scope)) problems.push(`Required OAuth scope missing: ${scope}`);
}

const forbiddenMarkers = [
  'DriveApp.',
  'ScriptApp.',
  'script.googleapis.com/v1/',
  'script.projects',
  'script.deployments',
  'pulseAutopilotInstallV14',
  'runPulseForge'
];
for (const marker of forbiddenMarkers) {
  if (source.includes(marker) || JSON.stringify(manifest).includes(marker)) {
    problems.push(`Forbidden runtime marker: ${marker}`);
  }
}

const requiredMarkers = [
  'function doGet(',
  'function setupPulseRebuild(',
  'function doctorPulseRebuild(',
  'function getMapCockpitState(',
  'const PULSE_INDEX_HTML = '
];
for (const marker of requiredMarkers) {
  if (!source.includes(marker)) problems.push(`Required runtime marker missing: ${marker}`);
}

const functions = [...source.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]);
const duplicates = functions.filter((name, index) => functions.indexOf(name) !== index);
if (duplicates.length) problems.push(`Duplicate server functions: ${[...new Set(duplicates)].join(', ')}`);

const builderRequiredFiles = [
  builderCodePath,
  builderContractPath,
  builderReadmePath,
  builderRollbackPath,
  builderTaskPath
];
for (const file of builderRequiredFiles) {
  if (!fs.existsSync(file)) builderProblems.push(`Missing Builder control file: ${path.relative(repoRoot, file)}`);
}

const builderSource = fs.existsSync(builderCodePath) ? fs.readFileSync(builderCodePath, 'utf8') : '';
try {
  new vm.Script(builderSource, { filename: 'pulse-agent/builder/SelfValidatingBuilder.gs' });
} catch (error) {
  builderProblems.push(`SelfValidatingBuilder.gs syntax error: ${error.message}`);
}

let builderContract = {};
let builderTask = {};
try {
  builderContract = JSON.parse(fs.readFileSync(builderContractPath, 'utf8'));
} catch (error) {
  builderProblems.push(`Builder contract error: ${error.message}`);
}
try {
  builderTask = JSON.parse(fs.readFileSync(builderTaskPath, 'utf8'));
} catch (error) {
  builderProblems.push(`PULSE-066 task snapshot error: ${error.message}`);
}

const builderReadme = fs.existsSync(builderReadmePath) ? fs.readFileSync(builderReadmePath, 'utf8') : '';
const builderRollback = fs.existsSync(builderRollbackPath) ? fs.readFileSync(builderRollbackPath, 'utf8') : '';

const builderCodeMarkers = [
  "TASK_ID:'PULSE-066'",
  'MAX_REPAIR_ATTEMPTS:3',
  'function runNextReadyTask()',
  'writeRunCurrentBuildState_(task, true);',
  'function runCurrentBuildValue_(task, running)',
  'return !!task && running !== true;',
  "return String(task && task['Task ID'] || '') === SELF_VALIDATING_BUILDER.TASK_ID;",
  'function testSelfValidatingBuilderBundle()'
];
for (const marker of builderCodeMarkers) {
  if (!builderSource.includes(marker)) builderProblems.push(`Builder marker missing: ${marker}`);
}

const builderFunctionNames = [...builderSource.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]);
const builderDuplicates = builderFunctionNames.filter((name, index) => builderFunctionNames.indexOf(name) !== index);
if (builderDuplicates.length) {
  builderProblems.push(`Duplicate Builder functions: ${[...new Set(builderDuplicates)].join(', ')}`);
}

const builderForbiddenMarkers = [
  'script.googleapis.com/v1/projects/',
  'script.deployments',
  '/merges',
  'merge_pull_request',
  'GITHUB_TOKEN =',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'BEGIN RSA PRIVATE KEY',
  'MailApp.',
  'CalendarApp.'
];
for (const marker of builderForbiddenMarkers) {
  if (builderSource.includes(marker)) builderProblems.push(`Forbidden Builder marker: ${marker}`);
}

if (builderContract.taskId !== 'PULSE-066') builderProblems.push('Builder contract taskId mismatch');
if (builderContract.command !== 'runNextReadyTask') builderProblems.push('Builder command mismatch');
if (builderContract.repair?.maximumAttempts !== 3) builderProblems.push('Builder repair limit mismatch');
if (builderContract.controlContract?.neverInvert !== true) builderProblems.push('RUN CURRENT BUILD neverInvert mismatch');
if (builderContract.controlContract?.oneTaskPerCommand !== true) builderProblems.push('One-task-per-command mismatch');
if (builderContract.controlContract?.readyValue !== true) builderProblems.push('Ready value must be true');
if (builderContract.controlContract?.runningValue !== false) builderProblems.push('Running value must be false');
if (builderContract.controlContract?.blockedValue !== false) builderProblems.push('Blocked value must be false');
if (builderContract.taskClassifier !== 'TASK_ID_ONLY') builderProblems.push('Task classifier must be TASK_ID_ONLY');
if (builderContract.repositoryCi?.required !== true) builderProblems.push('Repository CI must be required');
if (builderContract.repositoryCi?.workflow !== '.github/workflows/pulse-runtime-autobuild.yml') {
  builderProblems.push('Repository CI workflow mismatch');
}
if (builderContract.repositoryCi?.validator !== 'pulse-autobuild/scripts/validate.mjs') {
  builderProblems.push('Repository CI validator mismatch');
}
if (builderContract.production?.automaticMerge !== false) builderProblems.push('Automatic merge must remain false');
if (builderContract.production?.automaticDeployment !== false) builderProblems.push('Automatic deployment must remain false');

if (builderTask['Task ID'] !== 'PULSE-066') builderProblems.push('PULSE-066 task snapshot ID mismatch');
if (!String(builderTask.builder?.version || '').startsWith('0.6.1.2')) {
  builderProblems.push('PULSE-066 task snapshot is not v0.6.1.2');
}
if (builderTask.builder?.reviewRepair?.repositoryCiWired !== true) {
  builderProblems.push('PULSE-066 task snapshot lacks repository CI repair proof');
}

for (const marker of [
  'Repository CI',
  'pulse-runtime-autobuild.yml',
  'pulse-autobuild/scripts/validate.mjs',
  'does not merge'
]) {
  if (!builderReadme.includes(marker)) builderProblems.push(`Builder README marker missing: ${marker}`);
}
for (const marker of [
  'Preserve all Build, Task, Log',
  'Do not deploy or merge',
  'repository validator'
]) {
  if (!builderRollback.includes(marker)) builderProblems.push(`Builder rollback marker missing: ${marker}`);
}


const driverProblems = [];
for (const file of [driverCodePath, driverIndexPath, driverReadmePath]) {
  if (!fs.existsSync(file)) driverProblems.push(`Missing Hoy Driver file: ${path.relative(repoRoot, file)}`);
}
const driverCode = fs.existsSync(driverCodePath) ? fs.readFileSync(driverCodePath, 'utf8') : '';
const driverHtml = fs.existsSync(driverIndexPath) ? fs.readFileSync(driverIndexPath, 'utf8') : '';
const driverReadme = fs.existsSync(driverReadmePath) ? fs.readFileSync(driverReadmePath, 'utf8') : '';

try {
  new vm.Script(driverCode, { filename: 'apps-script/hoy-driver-os-writer/Code.gs' });
} catch (error) {
  driverProblems.push(`Hoy Driver Code.gs syntax error: ${error.message}`);
}
const inlineScripts = [...driverHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((source) => source.trim());
for (const [index, inlineSource] of inlineScripts.entries()) {
  try {
    new vm.Script(inlineSource, { filename: `apps-script/hoy-driver-os-writer/Index.inline-${index + 1}.js` });
  } catch (error) {
    driverProblems.push(`Hoy Driver inline script ${index + 1} syntax error: ${error.message}`);
  }
}

for (const marker of [
  "const HOY_SHEET_ID = '13m_9QDnIgXSdMBdtSYMjmyIdo55wh8F5Fl3_1JaYl-w';",
  "const HOY_BUILD = 'hoy-normal-flow-2026-07-28.1';",
  'function logCompletedTrip(payload)',
  'function tripLogSheet_(ss)',
  'function writeTripRow_(sh, p)',
  'earningsPending: !earningsProvided',
  'testWorkbookTargeted: false'
]) {
  if (!driverCode.includes(marker)) driverProblems.push(`Hoy Driver normal-flow marker missing: ${marker}`);
}
for (const forbidden of [
  'HOY_DEFAULT_TEST',
  'testsSheet_',
  'closeTest_',
  'readTestSummary_',
  'closeT001',
  'testStrip',
  'T-001 closed'
]) {
  if (driverCode.includes(forbidden) || driverHtml.includes(forbidden)) {
    driverProblems.push(`Legacy test marker remains in Hoy Driver: ${forbidden}`);
  }
}
for (const marker of [
  "var S={shift:null, active:null, queued:null, scheduled:[], requests:[], pendingTrips:[]};",
  "srv('logCompletedTrip',payload)",
  "start.textContent='Begin pickup'",
  "'On the way',s.requestId+':on-the-way'",
  'Earnings pending reconciliation',
  'function flushPendingTrips_()'
]) {
  if (!driverHtml.includes(marker)) driverProblems.push(`Hoy Driver client marker missing: ${marker}`);
}
for (const marker of [
  'PULSE-068 normal-flow cutover',
  'Shift Log',
  'Trip Log',
  'earnings are optional',
  'No automatic merge or Apps Script deployment occurs'
]) {
  if (!driverReadme.toLowerCase().includes(marker.toLowerCase())) {
    driverProblems.push(`Hoy Driver README marker missing: ${marker}`);
  }
}
const driverFunctionNames = [...driverCode.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]);
const driverDuplicates = driverFunctionNames.filter((name, index) => driverFunctionNames.indexOf(name) !== index);
if (driverDuplicates.length) {
  driverProblems.push(`Duplicate Hoy Driver functions: ${[...new Set(driverDuplicates)].join(', ')}`);
}

problems.push(...builderProblems, ...driverProblems);

const builderReport = {
  ok: builderProblems.length === 0,
  version: builderContract.version || '',
  taskId: builderContract.taskId || '',
  command: builderContract.command || '',
  serverFunctionCount: builderFunctionNames.length,
  duplicateServerFunctions: [...new Set(builderDuplicates)],
  readyValue: builderContract.controlContract?.readyValue,
  runningValue: builderContract.controlContract?.runningValue,
  blockedValue: builderContract.controlContract?.blockedValue,
  taskClassifier: builderContract.taskClassifier || '',
  repositoryCi: builderContract.repositoryCi || {},
  codeBytes: Buffer.byteLength(builderSource),
  codeSha256: crypto.createHash('sha256').update(builderSource).digest('hex'),
  problems: builderProblems
};

const report = {
  ok: problems.length === 0,
  release: '1.4.2-runtime-lite',
  generatedAt: new Date().toISOString(),
  serverFunctionCount: functions.length,
  duplicateServerFunctions: [...new Set(duplicates)],
  oauthScopes: scopes,
  codeBytes: Buffer.byteLength(source),
  codeSha256: crypto.createHash('sha256').update(source).digest('hex'),
  builderControl: builderReport,
  hoyDriverNormalFlow: {
    ok: driverProblems.length === 0,
    build: 'hoy-normal-flow-2026-07-28.1',
    serverFunctionCount: driverFunctionNames.length,
    duplicateServerFunctions: [...new Set(driverDuplicates)],
    problems: driverProblems
  },
  problems
};

fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/VALIDATION.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
