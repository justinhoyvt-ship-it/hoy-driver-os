/**
 * ForgeEngine — reusable task-package assembly, artifact adapters, bounded
 * repair, validation receipts, deterministic fixtures, and project templates.
 */
const FORGE_ENGINE_CORE = Object.freeze({
  VERSION: '1.0.0',
  RECEIPT_PREFIX: 'PULSE_FORGE_RECEIPT_V1_',
  RECEIPT_INDEX_KEY: 'PULSE_FORGE_RECEIPT_INDEX_V1',
  MAX_RECEIPTS: 100,
  TEMPLATE_IDS: Object.freeze(['ENGINE', 'WEB_APP', 'LIBRARY'])
});

function forgeGenerateTaskPackage(spec) {
  spec = spec || {};
  const taskId = forgeString_(spec.taskId).trim();
  const packageId = forgeString_(spec.packageId || taskId).trim();
  forgeAssert_(taskId, 'taskId is required.');
  forgeAssert_(packageId, 'packageId is required.');

  const files = forgeCanonicalFiles_(spec.files || []);
  const requiredFunctions = (spec.requiredFunctions || []).map(forgeString_).filter(Boolean).sort();
  const validation = forgeValidatePackage({
    packageId: packageId,
    files: files,
    requiredFunctions: requiredFunctions
  });
  forgeAssert_(validation.ok, 'Task package validation failed: ' + validation.problems.join(' | '));

  const deterministic = {
    schemaVersion: 1,
    taskId: taskId,
    packageId: packageId,
    projectAlias: forgeString_(spec.projectAlias).trim().toUpperCase(),
    templateId: forgeString_(spec.templateId).trim().toUpperCase(),
    requiredFunctions: requiredFunctions,
    metadata: spec.metadata || {},
    files: files
  };
  return forgeResult_(true, {
    taskPackage: Object.assign({}, deterministic, {
      packageHash: forgePackageHash_(files),
      deterministicHash: forgeSha256_(forgeStableJson_(deterministic)),
      inventory: forgeFileInventory_(files),
      generatedAt: forgeNowIso_()
    }),
    validation: validation,
    writesPerformed: false,
    productionTouched: false
  });
}

function forgeReadDriveTextArtifact(request) {
  request = request || {};
  const fileId = forgeString_(request.fileId).trim();
  forgeAssert_(fileId, 'Drive artifact fileId is required.');
  const file = DriveApp.getFileById(fileId);
  const blob = file.getBlob();
  const content = forgeNormalizeText_(blob.getDataAsString('UTF-8'));
  return forgeResult_(true, {
    artifact: {
      source: 'GOOGLE_DRIVE',
      fileId: fileId,
      name: file.getName(),
      mimeType: file.getMimeType(),
      updatedAt: file.getLastUpdated().toISOString(),
      bytes: forgeUtf8Bytes_(content),
      sha256: forgeSha256_(content),
      content: content
    },
    writesPerformed: false
  });
}

function forgeReadSheetRangeArtifact(request) {
  request = request || {};
  const spreadsheetId = forgeString_(request.spreadsheetId).trim();
  const sheetName = forgeString_(request.sheetName).trim();
  forgeAssert_(spreadsheetId && sheetName, 'spreadsheetId and sheetName are required.');
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName(sheetName);
  forgeAssert_(sheet, 'Sheet not found: ' + sheetName);
  const range = request.rangeA1 ? sheet.getRange(forgeString_(request.rangeA1)) : sheet.getDataRange();
  const rows = range.getDisplayValues();
  const content = forgeStableJson_({
    spreadsheetId: spreadsheetId,
    sheetName: sheetName,
    rangeA1: range.getA1Notation(),
    rows: rows
  });
  return forgeResult_(true, {
    artifact: {
      source: 'GOOGLE_SHEETS',
      spreadsheetId: spreadsheetId,
      sheetName: sheetName,
      rangeA1: range.getA1Notation(),
      rows: rows,
      rowCount: rows.length,
      columnCount: rows.length ? rows[0].length : 0,
      sha256: forgeSha256_(content),
      content: content
    },
    writesPerformed: false
  });
}

function forgeArtifactToProjectFile(request) {
  request = request || {};
  const artifact = request.artifact || {};
  const name = forgeString_(request.name || artifact.name).trim();
  const type = forgeString_(request.type || 'SERVER_JS').trim().toUpperCase();
  forgeAssert_(name, 'Project file name is required.');
  const file = forgeCanonicalFiles_([{
    name: name,
    type: type,
    source: forgeString_(request.source !== undefined ? request.source : artifact.content)
  }])[0];
  return forgeResult_(true, { file: file, writesPerformed: false });
}

function forgeGenerateTaskPackageFromArtifacts(request) {
  request = request || {};
  const files = (request.artifacts || []).map(function(item) {
    return forgeArtifactToProjectFile(item).file;
  });
  return forgeGenerateTaskPackage(Object.assign({}, request, { files: files }));
}

function forgeReusableProjectTemplate(templateId, options) {
  options = options || {};
  const id = forgeString_(templateId).trim().toUpperCase();
  forgeAssert_(FORGE_ENGINE_CORE.TEMPLATE_IDS.indexOf(id) >= 0, 'Unsupported Forge template: ' + id);
  const projectName = forgeString_(options.projectName || 'Forge Project').trim();
  const namespace = forgeString_(options.namespace || 'forgeProject').replace(/[^A-Za-z0-9_$]/g, '');
  forgeAssert_(namespace && /^[A-Za-z_$]/.test(namespace), 'Template namespace must be a valid JavaScript identifier prefix.');

  let source;
  let requiredFunctions;
  if (id === 'ENGINE') {
    source = [
      '/** Replaceable Forge engine project. */',
      "const " + namespace.toUpperCase() + "_INFO = Object.freeze({ name: " + JSON.stringify(projectName) + ", version: '1.0.0' });",
      '',
      'function forgeEngineSelfTest() {',
      '  return { ok: true, name: ' + namespace.toUpperCase() + '_INFO.name, version: ' + namespace.toUpperCase() + '_INFO.version, writesPerformed: false };',
      '}'
    ].join('\n');
    requiredFunctions = ['forgeEngineSelfTest'];
  } else if (id === 'WEB_APP') {
    source = [
      '/** Reusable Forge web-app project. */',
      'function doGet() {',
      "  return ContentService.createTextOutput(JSON.stringify({ ok: true, app: " + JSON.stringify(projectName) + " }))",
      "    .setMimeType(ContentService.MimeType.JSON);",
      '}',
      '',
      'function ' + namespace + 'Health() {',
      "  return { ok: true, app: " + JSON.stringify(projectName) + ", writesPerformed: false };",
      '}'
    ].join('\n');
    requiredFunctions = ['doGet', namespace + 'Health'];
  } else {
    source = [
      '/** Reusable Forge library project. */',
      'function ' + namespace + 'Health() {',
      "  return { ok: true, library: " + JSON.stringify(projectName) + ", writesPerformed: false };",
      '}'
    ].join('\n');
    requiredFunctions = [namespace + 'Health'];
  }

  const scopes = (options.oauthScopes || []).map(forgeString_).filter(Boolean).sort();
  const manifest = {
    timeZone: forgeString_(options.timeZone || 'America/New_York'),
    dependencies: {},
    exceptionLogging: 'STACKDRIVER',
    runtimeVersion: 'V8'
  };
  if (id === 'ENGINE') manifest.executionApi = { access: 'MYSELF' };
  if (scopes.length) manifest.oauthScopes = scopes;

  const files = [
    { name: 'Code', type: 'SERVER_JS', source: source },
    { name: 'appsscript', type: 'JSON', source: JSON.stringify(manifest, null, 2) }
  ];
  const packageResult = forgeGenerateTaskPackage({
    taskId: forgeString_(options.taskId || 'TEMPLATE-' + id),
    packageId: forgeString_(options.packageId || 'template-' + id.toLowerCase()),
    projectAlias: options.projectAlias,
    templateId: id,
    requiredFunctions: requiredFunctions,
    metadata: { projectName: projectName, namespace: namespace },
    files: files
  });
  return forgeResult_(true, {
    templateId: id,
    requiredFunctions: requiredFunctions,
    files: packageResult.taskPackage.files,
    packageHash: packageResult.taskPackage.packageHash,
    deterministicHash: packageResult.taskPackage.deterministicHash,
    writesPerformed: false
  });
}

function forgeRunRepairLoop(request) {
  request = request || {};
  forgeAssert_(typeof request.validate === 'function', 'Repair loop validate callback is required.');
  forgeAssert_(typeof request.repair === 'function', 'Repair loop repair callback is required.');
  const requested = Number(request.maxAttempts || FORGE_CORE.MAX_REPAIR_ATTEMPTS);
  const maxAttempts = Math.max(1, Math.min(FORGE_CORE.MAX_REPAIR_ATTEMPTS, isFinite(requested) ? Math.floor(requested) : FORGE_CORE.MAX_REPAIR_ATTEMPTS));
  let candidate = forgeClone_(request.candidate || {});
  const attempts = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const validation = request.validate(forgeClone_(candidate), attempt) || { ok: false, problems: ['Validator returned no result.'] };
    attempts.push({
      attempt: attempt,
      candidateHash: forgeSha256_(forgeStableJson_(candidate)),
      ok: validation.ok === true,
      problems: validation.problems || []
    });
    if (validation.ok === true) {
      return forgeResult_(true, {
        candidate: candidate,
        validation: validation,
        attempts: attempts,
        attemptCount: attempts.length,
        maxAttempts: maxAttempts,
        writesPerformed: false,
        productionTouched: false
      });
    }
    if (attempt < maxAttempts) {
      const repaired = request.repair(forgeClone_(candidate), validation, attempt);
      forgeAssert_(repaired !== undefined && repaired !== null, 'Repair callback returned no candidate.');
      candidate = forgeClone_(repaired);
    }
  }

  return forgeResult_(false, {
    candidate: candidate,
    validation: { ok: false, problems: attempts.length ? attempts[attempts.length - 1].problems : ['No validation attempts ran.'] },
    attempts: attempts,
    attemptCount: attempts.length,
    maxAttempts: maxAttempts,
    writesPerformed: false,
    productionTouched: false
  });
}

function forgeCreateValidationReceipt(request) {
  request = request || {};
  const validation = request.validation || {};
  forgeAssert_(validation.ok === true, 'A passing validation result is required.');
  const taskId = forgeString_(request.taskId).trim();
  const projectAlias = forgeString_(request.projectAlias).trim().toUpperCase();
  const packageHash = forgeString_(request.packageHash).trim();
  forgeAssert_(taskId && projectAlias && packageHash, 'taskId, projectAlias, and packageHash are required.');
  const identity = {
    schemaVersion: 1,
    taskId: taskId,
    projectAlias: projectAlias,
    packageHash: packageHash,
    testName: forgeString_(request.testName || 'validation'),
    testResultHash: forgeSha256_(forgeStableJson_(validation))
  };
  return forgeResult_(true, {
    receipt: Object.assign({}, identity, {
      receiptId: forgeSha256_(forgeStableJson_(identity)),
      ok: true,
      validatedAt: forgeNowIso_(),
      validation: validation,
      deploymentId: forgeString_(request.deploymentId),
      versionNumber: request.versionNumber === undefined ? null : Number(request.versionNumber),
      productionTouched: false
    }),
    writesPerformed: false
  });
}

function forgeStoreValidationReceipt(receipt) {
  receipt = receipt || {};
  forgeAssert_(receipt.ok === true && forgeString_(receipt.receiptId), 'A passing validation receipt is required.');
  const props = PropertiesService.getScriptProperties();
  const key = FORGE_ENGINE_CORE.RECEIPT_PREFIX + receipt.receiptId;
  const serialized = forgeStableJson_(receipt);
  const existing = props.getProperty(key);
  forgeAssert_(!existing || existing === serialized, 'Validation receipt is immutable and already differs.');
  props.setProperty(key, serialized);

  let index = [];
  try { index = JSON.parse(props.getProperty(FORGE_ENGINE_CORE.RECEIPT_INDEX_KEY) || '[]'); } catch (_error) { index = []; }
  index = index.filter(function(id) { return id !== receipt.receiptId; });
  index.unshift(receipt.receiptId);
  index = index.slice(0, FORGE_ENGINE_CORE.MAX_RECEIPTS);
  props.setProperty(FORGE_ENGINE_CORE.RECEIPT_INDEX_KEY, JSON.stringify(index));
  return forgeResult_(true, { receiptId: receipt.receiptId, stored: true, productionTouched: false });
}

function forgeGetValidationReceipt(receiptId) {
  const id = forgeString_(receiptId).trim();
  forgeAssert_(id, 'receiptId is required.');
  const raw = PropertiesService.getScriptProperties().getProperty(FORGE_ENGINE_CORE.RECEIPT_PREFIX + id);
  return forgeResult_(!!raw, { receipt: raw ? JSON.parse(raw) : null, writesPerformed: false });
}

function forgeListValidationReceipts() {
  const props = PropertiesService.getScriptProperties();
  let index = [];
  try { index = JSON.parse(props.getProperty(FORGE_ENGINE_CORE.RECEIPT_INDEX_KEY) || '[]'); } catch (_error) { index = []; }
  const receipts = index.map(function(id) {
    const raw = props.getProperty(FORGE_ENGINE_CORE.RECEIPT_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  }).filter(Boolean);
  return forgeResult_(true, { receipts: receipts, count: receipts.length, writesPerformed: false });
}

function forgeDeterministicFixture(name) {
  const id = forgeString_(name || 'TASK_PACKAGE').trim().toUpperCase();
  if (id === 'TASK_PACKAGE') {
    return {
      taskId: 'FIXTURE-001',
      packageId: 'fixture-package',
      projectAlias: 'ENGINE_B',
      requiredFunctions: ['fixtureHealth'],
      metadata: { purpose: 'deterministic-test', version: 1 },
      files: [
        { name: 'Code', type: 'SERVER_JS', source: 'function fixtureHealth(){return {ok:true};}\n' },
        { name: 'appsscript', type: 'JSON', source: '{"runtimeVersion":"V8","timeZone":"America/New_York"}' }
      ]
    };
  }
  if (id === 'REPAIR') return { value: 0, target: 2 };
  throw new Error('Unknown Forge fixture: ' + id);
}

function forgeEngineCoreSelfTest() {
  const fixture = forgeDeterministicFixture('TASK_PACKAGE');
  const packageA = forgeGenerateTaskPackage(fixture);
  const packageB = forgeGenerateTaskPackage(forgeClone_(fixture));
  const repair = forgeRunRepairLoop({
    candidate: forgeDeterministicFixture('REPAIR'),
    maxAttempts: 3,
    validate: function(candidate) {
      return { ok: candidate.value === candidate.target, problems: candidate.value === candidate.target ? [] : ['target-not-reached'] };
    },
    repair: function(candidate) {
      candidate.value += 1;
      return candidate;
    }
  });
  const template = forgeReusableProjectTemplate('ENGINE', {
    projectName: 'Fixture Engine',
    namespace: 'fixtureEngine',
    taskId: 'FIXTURE-TEMPLATE'
  });
  const ok = packageA.ok && packageB.ok &&
    packageA.taskPackage.packageHash === packageB.taskPackage.packageHash &&
    packageA.taskPackage.deterministicHash === packageB.taskPackage.deterministicHash &&
    repair.ok && repair.attemptCount === 3 &&
    template.ok;
  return forgeResult_(ok, {
    engineCoreVersion: FORGE_ENGINE_CORE.VERSION,
    packageHash: packageA.taskPackage.packageHash,
    deterministicHash: packageA.taskPackage.deterministicHash,
    repairAttempts: repair.attemptCount,
    templateHash: template.packageHash,
    writesPerformed: false,
    productionTouched: false
  });
}
