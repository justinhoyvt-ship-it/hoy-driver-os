import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const runtime = path.resolve('runtime');
const codePath = path.join(runtime, 'Code.gs');
const manifestPath = path.join(runtime, 'appsscript.json');
const problems = [];

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

const report = {
  ok: problems.length === 0,
  release: '1.4.2-runtime-lite',
  generatedAt: new Date().toISOString(),
  serverFunctionCount: functions.length,
  duplicateServerFunctions: [...new Set(duplicates)],
  oauthScopes: scopes,
  codeBytes: Buffer.byteLength(source),
  codeSha256: crypto.createHash('sha256').update(source).digest('hex'),
  problems
};

fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/VALIDATION.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
