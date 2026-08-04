import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const cwd = process.cwd();
const root = path.basename(cwd) === 'pulse-forge' ? cwd : path.resolve(cwd, 'pulse-forge');
const files = [
  'core/ForgeCore.gs',
  'core/ForgeValidator.gs',
  'core/ForgeEngine.gs'
].map((name) => path.join(root, name));
const manifestPath = path.join(root, 'appsscript.json');
const fixturePath = path.join(root, 'tests/fixtures/task-package.json');
const problems = [];

for (const file of files) {
  if (!fs.existsSync(file)) {
    problems.push(`Missing PULSE-077 file: ${file}`);
    continue;
  }
  try {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
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
if (!(manifest.oauthScopes || []).includes('https://www.googleapis.com/auth/drive.readonly')) {
  problems.push('Drive read-only scope is required for artifact adapters.');
}

let fixture = null;
try {
  fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
} catch (error) {
  problems.push(`Fixture error: ${error.message}`);
}

const combined = files.filter(fs.existsSync).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
for (const marker of [
  'function forgeGenerateTaskPackage(spec)',
  'function forgeReadDriveTextArtifact(request)',
  'function forgeReadSheetRangeArtifact(request)',
  'function forgeGenerateTaskPackageFromArtifacts(request)',
  'function forgeReusableProjectTemplate(templateId, options)',
  'function forgeRunRepairLoop(request)',
  'function forgeCreateValidationReceipt(request)',
  'function forgeStoreValidationReceipt(receipt)',
  'function forgeGetValidationReceipt(receiptId)',
  'function forgeListValidationReceipts()',
  'function forgeDeterministicFixture(name)',
  'function forgeEngineCoreSelfTest()'
]) {
  if (!combined.includes(marker)) problems.push(`Required PULSE-077 marker missing: ${marker}`);
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
  isFinite,
  Utilities: {
    Charset: { UTF_8: 'UTF_8' },
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    newBlob: (value) => ({ getBytes: () => [...Buffer.from(String(value), 'utf8')] }),
    computeDigest: (_algorithm, value) => [...crypto.createHash('sha256').update(String(value), 'utf8').digest()],
    getUuid: () => '00000000-0000-4000-8000-000000000000'
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (key) => propertyStore.get(key) ?? null,
      setProperty: (key, value) => { propertyStore.set(key, String(value)); },
      deleteProperty: (key) => { propertyStore.delete(key); }
    })
  },
  DriveApp: { getFileById: () => { throw new Error('Drive adapter should not make a live call in CI'); } },
  SpreadsheetApp: { openById: () => { throw new Error('Sheet adapter should not make a live call in CI'); } }
};
vm.createContext(context);

try {
  new vm.Script(combined, { filename: 'pulse-forge/pulse-077-combined.gs' }).runInContext(context);
  const selfTest = context.forgeEngineCoreSelfTest();
  if (!selfTest || selfTest.ok !== true) problems.push('PULSE-077 engine self-test failed.');

  const installManifest = {
    timeZone: 'America/New_York',
    dependencies: {},
    exceptionLogging: 'STACKDRIVER',
    runtimeVersion: 'V8',
    executionApi: { access: 'MYSELF' },
    oauthScopes: [
      'https://www.googleapis.com/auth/script.external_request',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly'
    ]
  };
  const installFiles = [
    { name: 'ForgeCore', type: 'SERVER_JS', source: fs.readFileSync(files[0], 'utf8') },
    { name: 'ForgeValidator', type: 'SERVER_JS', source: fs.readFileSync(files[1], 'utf8') },
    { name: 'ForgeEngine', type: 'SERVER_JS', source: fs.readFileSync(files[2], 'utf8') },
    { name: 'appsscript', type: 'JSON', source: JSON.stringify(installManifest, null, 2) }
  ];
  const installValidation = context.forgeValidatePackage({
    packageId: 'PULSE-077-INSTALL',
    files: installFiles,
    requiredFunctions: ['forgeEngineCoreSelfTest']
  });
  if (!installValidation.ok) {
    problems.push(`PULSE-077 install package validation failed: ${installValidation.problems.join(' | ')}`);
  }

  if (fixture) {
    const first = context.forgeGenerateTaskPackage(fixture);
    const second = context.forgeGenerateTaskPackage(JSON.parse(JSON.stringify(fixture)));
    if (first.taskPackage.packageHash !== second.taskPackage.packageHash) problems.push('Package hash is not deterministic.');
    if (first.taskPackage.deterministicHash !== second.taskPackage.deterministicHash) problems.push('Task-package hash is not deterministic.');
  }

  const capped = context.forgeRunRepairLoop({
    candidate: { value: 0 },
    maxAttempts: 99,
    validate: () => ({ ok: false, problems: ['still-failing'] }),
    repair: (candidate) => ({ value: candidate.value + 1 })
  });
  if (capped.ok !== false || capped.attemptCount !== 3 || capped.maxAttempts !== 3) {
    problems.push('Repair loop did not fail closed at exactly three attempts.');
  }

  const receipt = context.forgeCreateValidationReceipt({
    taskId: 'PULSE-077',
    projectAlias: 'ENGINE_B',
    packageHash: 'fixture-package-hash',
    validation: { ok: true, suite: 'ci' }
  }).receipt;
  context.forgeStoreValidationReceipt(receipt);
  const loaded = context.forgeGetValidationReceipt(receipt.receiptId);
  const listed = context.forgeListValidationReceipts();
  if (!loaded.ok || loaded.receipt.receiptId !== receipt.receiptId || listed.count !== 1) {
    problems.push('Validation receipt storage round trip failed.');
  }

  for (const id of ['ENGINE', 'WEB_APP', 'LIBRARY']) {
    const template = context.forgeReusableProjectTemplate(id, {
      projectName: `Fixture ${id}`,
      namespace: `fixture${id}`,
      taskId: `FIXTURE-${id}`
    });
    if (!template.ok || template.files.length !== 2) problems.push(`Reusable ${id} template failed.`);
  }
} catch (error) {
  problems.push(`PULSE-077 mocked execution failed: ${error.message}`);
}

console.log(JSON.stringify({
  ok: problems.length === 0,
  checkedAt: new Date().toISOString(),
  files: files.length,
  fixture: !!fixture,
  problems
}, null, 2));
if (problems.length) process.exit(1);
