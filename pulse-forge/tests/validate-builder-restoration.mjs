import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const cwd = process.cwd();
const root = path.basename(cwd) === 'pulse-forge' ? cwd : path.resolve(cwd, 'pulse-forge');
const builderPath = path.join(root, 'controller', 'SelfValidatingBuilder.gs');
const installerPath = path.join(root, 'controller', 'PermanentBuilderInstaller.gs');
const manifestPath = path.join(root, 'builder-restoration', 'manifest.json');
const readmePath = path.join(root, 'builder-restoration', 'README.md');
const rollbackPath = path.join(root, 'builder-restoration', 'ROLLBACK.md');
const problems = [];

const read = (file) => fs.readFileSync(file, 'utf8');
const sha256 = (text) => crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
const builder = read(builderPath);
const installer = read(installerPath);
const manifest = JSON.parse(read(manifestPath));
const readme = read(readmePath);
const rollback = read(rollbackPath);

for (const [file, source] of [[builderPath, builder], [installerPath, installer]]) {
  try { new vm.Script(source, { filename: file }); }
  catch (error) { problems.push(`${path.basename(file)} syntax error: ${error.message}`); }
}

const functionNames = (source) => [...source.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((match) => match[1]);
const builderFunctions = functionNames(builder);
const installerFunctions = functionNames(installer);
for (const duplicate of [...new Set(builderFunctions.filter((name, index) => builderFunctions.indexOf(name) !== index))]) {
  problems.push(`Duplicate Builder function: ${duplicate}`);
}
for (const duplicate of [...new Set(installerFunctions.filter((name, index) => installerFunctions.indexOf(name) !== index))]) {
  problems.push(`Duplicate installer function: ${duplicate}`);
}

for (const marker of [
  'function runNextReadyTask()',
  'function forgePermanentBuilderSelfTest(options)',
  'function forgePermanentBuilderInstallationStatus()',
  'function forgeBuilderPreparePullRequest_(task)',
  'function forgeBuilderPollPullRequest_(task, state)',
  'function forgeBuilderStageMergedTask_(task, state)',
  'function forgeBuilderRecordPhoneTest(request)',
  'MAX_REPAIR_ATTEMPTS: 3',
  "TASK_PACKAGE_ROOT: 'pulse-forge/tasks'",
  "manifest.branch === 'pulse/' + taskId.toLowerCase()",
  'oneTaskOnePullRequest: true',
  'automaticMerge: false',
  'automaticProductionDeployment: false',
  'engineActivationPerformed: false',
  'productionTouched: false'
]) {
  if (!builder.includes(marker)) problems.push(`Builder missing marker: ${marker}`);
}

for (const marker of [
  'function forgeInstallPermanentBuilder()',
  'function forgeRollbackPermanentBuilderInstallation()',
  'function forgeBuilderRestorePreservationGate_(beforeFiles, afterFiles, expectedBuilderHash)',
  "status: 'VERIFYING'",
  "status: 'VERIFIED'",
  'forgeCreateScriptVersion(',
  'forgeBuilderRestorePutContent_(before.files)',
  'forgePermanentBuilderSelfTest',
  'devMode: false',
  'temporaryPulseFilesRemoved: false',
  'codeFileOverwritten: false',
  'isolatedTestDeploymentCreated: true',
  'productionDeploymentCreated: false'
]) {
  if (!installer.includes(marker)) problems.push(`Installer missing marker: ${marker}`);
}

for (const forbidden of [
  'merge_pull_request',
  "'/merges'",
  'AUTOMATIC_MERGE: true',
  'AUTOMATIC_PRODUCTION_DEPLOYMENT: true',
  'forgeSetActiveEngineSlot(',
  'forgeValidateAndActivateEngine(',
  'MailApp.',
  'CalendarApp.',
  'runNextReadyTaskCore_',
  'validateNextReadyTaskCore_',
  'const PB =',
  'PB.',
  'sheet_('
]) {
  if (builder.includes(forbidden)) problems.push(`Builder contains forbidden legacy/unsafe marker: ${forbidden}`);
}
if (builder.includes('/merges') || builder.includes('merge_pull_request')) {
  problems.push('Builder contains a GitHub merge endpoint.');
}

if (manifest.schemaVersion !== 1 || manifest.taskId !== 'PULSE-080R') problems.push('Restoration manifest identity is invalid.');
if (manifest.branch !== 'copilot/pulse-080r-permanent-builder-restoration') problems.push('Restoration branch is not stable.');
if (manifest.builderPath !== 'pulse-forge/controller/SelfValidatingBuilder.gs') problems.push('Builder path is invalid.');
if (manifest.builderSha256 !== sha256(builder)) problems.push('Manifest Builder SHA-256 does not match source.');
if (manifest.install?.preserveCodeGs !== true || manifest.install?.preserveAllExistingSourceFiles !== true || manifest.install?.manifestAdditiveExecutionApiOnly !== true) problems.push('Manifest does not require source preservation with an additive executionApi-only manifest change.');
if (manifest.install?.separatePermanentFile !== true || manifest.install?.removeTemporaryFiles !== false) problems.push('Manifest installation boundaries are invalid.');
if (manifest.install?.createIsolatedExecutionDeployment !== true || manifest.install?.createProductionDeployment !== false || manifest.install?.runtimeSelfTestRequired !== true || manifest.install?.automaticRollbackOnFailure !== true) problems.push('Manifest runtime installation gates are invalid.');
if (manifest.safety?.automaticMerge !== false || manifest.safety?.productionDeployment !== false || manifest.safety?.engineActivation !== false || manifest.safety?.productionDataMutation !== false || manifest.safety?.overwriteCodeGs !== false) problems.push('Manifest safety contract is invalid.');
if (!Array.isArray(manifest.requiredCiChecks) || !manifest.requiredCiChecks.includes('validate-forge')) problems.push('Restoration manifest does not require validate-forge CI.');

for (const marker of [
  'does not replace `Code.gs`',
  'preserves every existing server and HTML file byte-for-byte',
  'isolated API Executable deployment',
  'rolls back automatically',
  'PULSE-080 remains untouched'
]) {
  if (!readme.includes(marker)) problems.push(`README missing marker: ${marker}`);
}
for (const marker of ['immutable Apps Script version', 'exact pre-install file package', 'forgeRollbackPermanentBuilderInstallation()', 'does not merge GitHub']) {
  if (!rollback.includes(marker)) problems.push(`ROLLBACK missing marker: ${marker}`);
}

function makeCoreHelpers() {
  const stable = (value) => {
    const sort = (input) => {
      if (Array.isArray(input)) return input.map(sort);
      if (input && Object.prototype.toString.call(input) === '[object Object]') {
        return Object.keys(input).sort().reduce((out, key) => { out[key] = sort(input[key]); return out; }, {});
      }
      return input;
    };
    return JSON.stringify(sort(value));
  };
  const canonical = (files) => files.map((file) => ({ name: String(file.name), type: String(file.type), source: String(file.source ?? '') }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type));
  const inventory = (files) => canonical(files).map((file) => ({
    name: file.name,
    type: file.type,
    bytes: Buffer.byteLength(file.source, 'utf8'),
    sha256: sha256(file.source)
  }));
  return { stable, canonical, inventory };
}

function makeSheetMock() {
  const taskHeaders = ['Task ID', 'Created At', 'Priority', 'Status', 'Requested By', 'Area', 'Title', 'Problem / Request', 'Acceptance Criteria', 'Assigned Agent', 'Branch / Build', 'Result URL', 'Last Error', 'Updated At', 'Integration Hooks'];
  const taskRows = [taskHeaders, ['PULSE-080', new Date('2026-08-01T00:00:00Z'), 'CRITICAL', 'READY', '', '', 'Direct Ride Beta', 'Builder blocked', 'Builder must pass', '', '', '', 'entry missing', '', '']];
  const logHeaders = ['Logged At', 'Level', 'Agent', 'Task ID', 'Build ID', 'Stage', 'Message', 'Context JSON', 'Duration MS', 'HTTP Status', 'Retry Count', 'Run ID'];
  const logs = [logHeaders];
  const makeSheet = (rows) => ({
    getDataRange: () => ({ getValues: () => rows.map((row) => row.slice()) }),
    getLastColumn: () => rows[0].length,
    getRange: (row, col, numRows = 1, numCols = 1) => ({
      getValues: () => rows.slice(row - 1, row - 1 + numRows).map((source) => source.slice(col - 1, col - 1 + numCols)),
      setValue: (value) => { rows[row - 1][col - 1] = value; }
    }),
    appendRow: (row) => rows.push(row.slice())
  });
  const tasks = makeSheet(taskRows);
  const logSheet = makeSheet(logs);
  return {
    SpreadsheetApp: { openById: () => ({ getSheetByName: (name) => name === 'Tasks' ? tasks : name === 'Logs' ? logSheet : null }) },
    taskRows,
    logs
  };
}

function runInstallerScenario({ runtimePass, duplicateEntry = false }) {
  const { stable, canonical, inventory } = makeCoreHelpers();
  const properties = new Map();
  const sheetMock = makeSheetMock();
  const manifestText = JSON.stringify(manifest, null, 2) + '\n';
  const installerSource = installer;
  const beforeFiles = canonical([
    { name: 'appsscript', type: 'JSON', source: JSON.stringify({ timeZone: 'America/New_York', runtimeVersion: 'V8' }) },
    { name: 'Code', type: 'SERVER_JS', source: 'function forgeControllerStatus(){return {ok:true};}\n' + (duplicateEntry ? 'function runNextReadyTask(){return {legacy:true};}\n' : '') },
    { name: 'PULSE077Installer', type: 'SERVER_JS', source: 'function forgeTemporaryInstaller(){return true;}\n' },
    { name: 'PermanentBuilderInstaller', type: 'SERVER_JS', source: installerSource }
  ]);
  let currentFiles = canonical(beforeFiles);
  let rollbackSnapshot = canonical(beforeFiles);
  let versionsCreated = 0;
  let putCount = 0;
  let deploymentPosts = 0;
  let deploymentDeletes = 0;

  const packageHash = (files) => sha256(stable(inventory(files)));
  const contentResult = (files) => ({
    ok: true,
    scriptId: manifest.controllerScriptId,
    files: canonical(files),
    inventory: inventory(files),
    packageHash: packageHash(files)
  });

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
    globalThis: null,
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => properties.get(key) ?? null,
      setProperty: (key, value) => properties.set(key, String(value)),
      deleteProperty: (key) => properties.delete(key)
    }) },
    ScriptApp: { getScriptId: () => manifest.controllerScriptId },
    Utilities: {
      base64Decode: (value) => [...Buffer.from(String(value), 'base64')],
      newBlob: (value) => ({ getDataAsString: () => Buffer.from(value).toString('utf8') }),
      getUuid: () => '00000000-0000-4000-8000-000000000000'
    },
    SpreadsheetApp: sheetMock.SpreadsheetApp,
    forgeAssert_: (condition, message) => { if (!condition) throw new Error(String(message)); },
    forgeString_: (value) => value === null || value === undefined ? '' : String(value),
    forgeSha256_: sha256,
    forgeStableJson_: stable,
    forgeCanonicalFiles_: canonical,
    forgeFileInventory_: inventory,
    forgePackageHash_: packageHash,
    forgeValidatePackage: ({ files, requiredFunctions = [] }) => {
      const combined = files.filter((file) => file.type === 'SERVER_JS').map((file) => file.source).join('\n');
      const missing = requiredFunctions.filter((name) => !combined.includes(`function ${name}(`));
      return { ok: missing.length === 0, problems: missing.map((name) => `missing ${name}`) };
    },
    forgeGitHubConnectionTest: () => ({ ok: true, repository: manifest.repository }),
    forgeGitHubApi_: (requestPath) => {
      if (requestPath.startsWith('/pulls?')) return [{
        number: 50,
        state: 'closed',
        merged_at: '2026-08-06T15:00:00Z',
        merge_commit_sha: 'merge-sha',
        html_url: 'https://github.com/example/pull/50',
        head: { ref: manifest.branch, sha: 'head-sha' }
      }];
      if (requestPath.startsWith('/commits/head-sha/check-runs')) return { check_runs: [{ name: 'validate-forge', status: 'completed', conclusion: 'success', completed_at: '2026-08-06T14:59:00Z' }] };
      if (requestPath.includes('/contents/' + manifest.builderPath.split('/').map(encodeURIComponent).join('/'))) {
        return { type: 'file', encoding: 'base64', content: Buffer.from(builder, 'utf8').toString('base64') };
      }
      if (requestPath.includes('/contents/' + 'pulse-forge/builder-restoration/manifest.json'.split('/').map(encodeURIComponent).join('/'))) {
        return { type: 'file', encoding: 'base64', content: Buffer.from(manifestText, 'utf8').toString('base64') };
      }
      throw new Error(`Unexpected GitHub request: ${requestPath}`);
    },
    forgeGetScriptContent: (_scriptId, versionNumber) => versionNumber ? contentResult(rollbackSnapshot) : contentResult(currentFiles),
    forgeCreateScriptVersion: () => { versionsCreated += 1; rollbackSnapshot = canonical(currentFiles); return { ok: true, version: { versionNumber: 7, description: 'rollback' } }; },
    forgeListDeployments: () => ({ deployments: [{ deploymentId: 'deployment-1', updateTime: '2026-08-06T14:00:00Z', entryPoints: [{ entryPointType: 'EXECUTION_API' }] }] }),
    forgeApiFetch_: (url, options = {}) => {
      if (url.includes('/projects/') && url.endsWith('/content') && String(options.method).toLowerCase() === 'put') {
        putCount += 1;
        currentFiles = canonical(options.payload.files);
        return { scriptId: manifest.controllerScriptId };
      }
      if (url.endsWith('/deployments') && String(options.method).toLowerCase() === 'post') {
        deploymentPosts += 1;
        return { deploymentId: 'deployment-1', entryPoints: [{ entryPointType: 'EXECUTION_API' }] };
      }
      if (url.includes('/deployments/') && String(options.method).toLowerCase() === 'delete') {
        deploymentDeletes += 1;
        return {};
      }
      if (url.includes('/scripts/')) {
        if (runtimePass) {
          return { response: { result: { ok: true, productionTouched: false, automaticMerge: false, automaticProductionDeployment: false } } };
        }
        return { error: { message: 'runtime self-test failed', details: [{ errorMessage: 'fixture runtime failure' }] } };
      }
      throw new Error(`Unexpected API request: ${url}`);
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  new vm.Script(installer, { filename: 'PermanentBuilderInstaller.gs' }).runInContext(context);

  let result = null;
  let error = null;
  try { result = context.forgeInstallPermanentBuilder(); }
  catch (caught) { error = caught; }
  return {
    result,
    error,
    currentFiles,
    beforeFiles,
    properties,
    versionsCreated,
    putCount,
    deploymentPosts,
    deploymentDeletes,
    packageHash,
    taskRows: sheetMock.taskRows,
    logs: sheetMock.logs
  };
}

try {
  const helperContext = {
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
    globalThis: null,
    forgeAssert_: (condition, message) => { if (!condition) throw new Error(String(message)); },
    forgeString_: (value) => value === null || value === undefined ? '' : String(value)
  };
  helperContext.globalThis = helperContext;
  vm.createContext(helperContext);
  new vm.Script(builder, { filename: 'SelfValidatingBuilder.gs' }).runInContext(helperContext);
  const fixture = helperContext.forgeBuilderDeterministicSelfTest_();
  if (!fixture?.ok) problems.push(`Builder deterministic self-test failed: ${JSON.stringify(fixture)}`);
  const repair = helperContext.forgeBuilderRunRepairLoop_({
    candidate: { value: 0, target: 2 },
    maxAttempts: 3,
    validate: (candidate) => ({ ok: candidate.value === candidate.target, problems: candidate.value === candidate.target ? [] : ['not-ready'] }),
    repair: (candidate) => ({ ...candidate, value: candidate.value + 1 })
  });
  if (!repair.ok || repair.attemptCount !== 3) problems.push('Builder repair loop did not pass on the third bounded attempt.');
} catch (error) {
  problems.push(`Builder mocked execution failed: ${error.message}`);
}

try {
  const success = runInstallerScenario({ runtimePass: true });
  if (success.error) problems.push(`Installer success fixture threw: ${success.error.message}`);
  if (!success.result?.ok || success.result?.status !== 'VERIFIED') problems.push('Installer success fixture did not return VERIFIED.');
  const current = Object.fromEntries(success.currentFiles.map((file) => [file.name, sha256(file.source)]));
  const before = Object.fromEntries(success.beforeFiles.map((file) => [file.name, sha256(file.source)]));
  for (const [name, hash] of Object.entries(before)) {
    if (name !== 'SelfValidatingBuilder' && name !== 'appsscript' && current[name] !== hash) problems.push(`Installer success fixture changed existing file: ${name}`);
  }
  if (current.Code !== before.Code) problems.push('Installer success fixture overwrote Code.gs.');
  if (current.SelfValidatingBuilder !== sha256(builder)) problems.push('Installer success fixture installed the wrong Builder source.');
  if (success.versionsCreated !== 2) problems.push('Installer success fixture did not create rollback and immutable installed versions.');
  if (success.putCount !== 1) problems.push(`Installer success fixture expected one content write, got ${success.putCount}.`);
  if (success.deploymentPosts !== 1) problems.push('Installer success fixture did not create exactly one isolated execution deployment.');
  if (success.result?.productionDeploymentCreated !== false) problems.push('Installer success fixture did not explicitly block production deployment.');
  const receipt = JSON.parse(success.properties.get('PULSE_FORGE_PERMANENT_BUILDER_INSTALL_V1') || '{}');
  if (receipt.status !== 'VERIFIED' || receipt.sourceSha256 !== sha256(builder)) problems.push('Installer success fixture stored an invalid receipt.');
  if (success.taskRows[1][3] !== 'READY_TO_RUN') problems.push('Installer success fixture did not unblock PULSE-080 only after verification.');
} catch (error) {
  problems.push(`Installer success fixture failed: ${error.message}`);
}

try {
  const failure = runInstallerScenario({ runtimePass: false });
  if (!failure.error || !/failed closed/.test(failure.error.message)) problems.push('Installer failure fixture did not fail closed.');
  if (failure.packageHash(failure.currentFiles) !== failure.packageHash(failure.beforeFiles)) problems.push('Installer failure fixture did not restore the exact pre-install package.');
  if (failure.versionsCreated !== 2) problems.push('Installer failure fixture did not create rollback and isolated-test versions before runtime verification.');
  if (failure.putCount !== 2) problems.push(`Installer failure fixture expected install plus rollback writes, got ${failure.putCount}.`);
  if (failure.properties.has('PULSE_FORGE_PERMANENT_BUILDER_INSTALL_V1')) problems.push('Installer failure fixture left a verified/partial installation property.');
  if (failure.deploymentPosts !== 1 || failure.deploymentDeletes !== 1) problems.push('Installer failure fixture did not create and then delete exactly one isolated execution deployment.');
} catch (error) {
  problems.push(`Installer failure fixture failed: ${error.message}`);
}

try {
  const duplicate = runInstallerScenario({ runtimePass: true, duplicateEntry: true });
  if (!duplicate.error || !/Duplicate server functions|runNextReadyTask/.test(duplicate.error.message)) problems.push('Duplicate runNextReadyTask fixture did not fail closed.');
  if (duplicate.putCount !== 0 || duplicate.versionsCreated !== 0) problems.push('Duplicate entry-point fixture mutated Apps Script before failing.');
} catch (error) {
  problems.push(`Duplicate entry-point fixture failed: ${error.message}`);
}

const report = {
  ok: problems.length === 0,
  checkedAt: new Date().toISOString(),
  taskId: 'PULSE-080R',
  builderSha256: sha256(builder),
  builderFunctions: builderFunctions.length,
  installerFunctions: installerFunctions.length,
  oneTaskOnePullRequest: true,
  preserveCodeGs: true,
  preserveExistingFiles: true,
  runtimeSelfTestRequired: true,
  automaticRollbackTested: true,
  isolatedExecutionDeploymentTested: true,
  productionDeploymentCreated: false,
  automaticMerge: false,
  productionDeployment: false,
  engineActivation: false,
  productionDataMutation: false,
  problems
};
console.log(JSON.stringify(report, null, 2));
if (problems.length) process.exit(1);
