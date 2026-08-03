import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root = path.resolve('pulse-forge');
const gsFiles = [
  'core/ForgeCore.gs',
  'core/ForgeRegistry.gs',
  'core/ForgeValidator.gs',
  'core/ForgeProjectApi.gs',
  'core/ForgeGitHub.gs',
  'controller/ForgeTemplates.gs',
  'controller/Code.gs'
].map((name) => path.join(root, name));
const manifestPath = path.join(root, 'appsscript.json');
const problems = [];

for (const file of gsFiles) {
  if (!fs.existsSync(file)) {
    problems.push(`Missing Forge file: ${file}`);
    continue;
  }
  const source = fs.readFileSync(file, 'utf8');
  try {
    new vm.Script(source, { filename: file });
  } catch (error) {
    problems.push(`${file} syntax error: ${error.message}`);
  }
}

let manifest = {};
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
  problems.push(`Manifest error: ${error.message}`);
}

const requiredScopes = [
  'https://www.googleapis.com/auth/script.projects',
  'https://www.googleapis.com/auth/script.deployments',
  'https://www.googleapis.com/auth/script.external_request',
  'https://www.googleapis.com/auth/spreadsheets'
];
const scopes = manifest.oauthScopes || [];
for (const scope of requiredScopes) {
  if (!scopes.includes(scope)) problems.push(`Missing required Forge scope: ${scope}`);
}
for (const forbidden of ['https://www.googleapis.com/auth/cloud-platform', 'https://mail.google.com/']) {
  if (scopes.includes(forbidden)) problems.push(`Forbidden broad scope: ${forbidden}`);
}

const sources = gsFiles.filter(fs.existsSync).map((file) => ({ file, source: fs.readFileSync(file, 'utf8') }));
const combined = sources.map((item) => item.source).join('\n');
const names = [...combined.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((match) => match[1]);
const duplicateNames = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
if (duplicateNames.length) problems.push(`Duplicate Forge functions: ${duplicateNames.join(', ')}`);

for (const marker of [
  'function forgeGitHubCreatePullRequest(request)',
  'function forgeBootstrapEngineSlots()',
  'function forgeWithBuildLock_(callback)',
  'function forgeControllerStatus()',
  'function forgePrepareProjectBuild(request)',
  'function forgeApplyProjectBuild(request)',
  'function forgeBuildInactiveEngine(request)',
  'function forgeControllerSelfTest()',
  'function forgeCreateScriptProject(spec)',
  'function forgeUpdateScriptContent(request)',
  'function forgeCreateScriptVersion(scriptId, description)',
  'function forgeCreateTestDeployment(request)',
  'function forgeValidatePackage(packageSpec)'
]) {
  if (!combined.includes(marker)) problems.push(`Required Forge marker missing: ${marker}`);
}

for (const forbidden of [
  'merge_pull_request',
  '/merges',
  'AUTOMATIC_MERGE: true',
  'AUTOMATIC_PRODUCTION_DEPLOYMENT: true',
  "project.environment === 'PRODUCTION' && project.allowHeadWrite"
]) {
  if (combined.includes(forbidden)) problems.push(`Forbidden Forge marker: ${forbidden}`);
}

if (!combined.includes("project.environment !== 'PRODUCTION'")) {
  problems.push('Non-production HEAD write guard is missing.');
}
if (!combined.includes("productionDeploymentId: environment === 'PRODUCTION'")) {
  problems.push('Production registry handling marker is missing.');
}
if (!combined.includes("const target = active === 'ENGINE_A' ? 'ENGINE_B' : 'ENGINE_A';")) {
  problems.push('A/B inactive-engine selection is missing.');
}
if (!combined.includes("'Rollback before ' + forgeString_")) {
  problems.push('Pre-update immutable rollback version is missing.');
}


const propertyStore = new Map();
const context = {
  console,
  Date,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Math,
  RegExp,
  Error,
  encodeURIComponent,
  Utilities: {
    Charset: { UTF_8: 'UTF_8' },
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    newBlob: (value) => ({ getBytes: () => [...Buffer.from(String(value), 'utf8')] }),
    computeDigest: (_algorithm, value) => [...crypto.createHash('sha256').update(String(value), 'utf8').digest()],
    getUuid: () => '00000000-0000-4000-8000-000000000000'
  },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (key) => propertyStore.get(key) ?? null,
      setProperty: (key, value) => { propertyStore.set(key, String(value)); },
      deleteProperty: (key) => { propertyStore.delete(key); }
    })
  },
  ScriptApp: { getOAuthToken: () => 'TEST_TOKEN' },
  UrlFetchApp: { fetch: () => { throw new Error('Network call attempted during local validation'); } },
  Session: { getScriptTimeZone: () => 'America/New_York' }
};
vm.createContext(context);
try {
  new vm.Script(combined, { filename: 'pulse-forge/combined.gs' }).runInContext(context);
  const selfTest = context.forgeControllerSelfTest();
  if (!selfTest || selfTest.ok !== true) problems.push('Forge controller self-test failed in mocked Apps Script runtime.');
  const secretTest = context.forgeValidatePackage({
    packageId: 'SECRET-TEST',
    files: [
      { name: 'Code', type: 'SERVER_JS', source: 'const token="ghp_123456789012345678901234567890";' },
      { name: 'appsscript', type: 'JSON', source: '{"timeZone":"America/New_York","runtimeVersion":"V8"}' }
    ]
  });
  if (secretTest.ok !== false) problems.push('Secret-pattern validation did not fail closed.');
  let duplicateBlocked = false;
  try {
    context.forgeCanonicalFiles_([
      { name: 'Code', type: 'SERVER_JS', source: '' },
      { name: 'code', type: 'SERVER_JS', source: '' }
    ]);
  } catch (_error) {
    duplicateBlocked = true;
  }
  if (!duplicateBlocked) problems.push('Case-insensitive duplicate file names were not blocked.');
} catch (error) {
  problems.push(`Mocked Apps Script execution failed: ${error.message}`);
}

const report = {
  ok: problems.length === 0,
  checkedAt: new Date().toISOString(),
  gsFiles: gsFiles.length,
  functions: names.length,
  duplicateFunctions: duplicateNames,
  scopes,
  problems
};
console.log(JSON.stringify(report, null, 2));
if (problems.length) process.exit(1);
