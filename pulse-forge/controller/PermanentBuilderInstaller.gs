/**
 * One-time, fail-closed installer for the permanent Pulse Forge Builder.
 *
 * Install this file beside Code.gs, then run forgeInstallPermanentBuilder only
 * after the reviewed restoration PR has been manually merged. The installer
 * preserves every existing controller file, creates an immutable rollback
 * version, adds SelfValidatingBuilder as a separate file, verifies the exact
 * source hash, runs the new Builder through an existing API Executable
 * deployment, and rolls back automatically if any gate fails.
 */
const FORGE_BUILDER_RESTORATION = Object.freeze({
  VERSION: '1.0.0',
  TASK_ID: 'PULSE-080R',
  REPOSITORY: 'justinhoyvt-ship-it/hoy-driver-os',
  BASE_BRANCH: 'main',
  RESTORATION_BRANCH: 'copilot/pulse-080r-permanent-builder-restoration',
  CONTROLLER_SCRIPT_ID: '11j6IpdCl9LjbjsLPfRQQIUBWn3-QEsZew04YvakE3S2Aiv6PjpqHoeXW',
  CONTROL_SHEET_ID: '1JuaJpLmdP6JtJK3xQ9KuptZ99auy0VwXJjQVbCwF2e0',
  MANIFEST_PATH: 'pulse-forge/builder-restoration/manifest.json',
  BUILDER_REPO_PATH: 'pulse-forge/controller/SelfValidatingBuilder.gs',
  BUILDER_FILE_NAME: 'SelfValidatingBuilder',
  INSTALLER_FILE_NAME: 'PermanentBuilderInstaller',
  INSTALL_STATE_KEY: 'PULSE_FORGE_PERMANENT_BUILDER_INSTALL_V1',
  REQUIRED_CHECKS: Object.freeze(['validate-forge']),
  MAX_FILES: 250
});

function forgeInstallPermanentBuilder() {
  const lock = LockService.getScriptLock();
  forgeAssert_(lock.tryLock(30000), 'Another Builder restoration run is active.');
  const props = PropertiesService.getScriptProperties();
  const previousStateRaw = props.getProperty(FORGE_BUILDER_RESTORATION.INSTALL_STATE_KEY);
  let before = null;
  let rollback = null;
  let candidateWritten = false;
  let isolatedDeploymentId = '';
  try {
    forgeBuilderRestoreDependencyGate_();
    forgeAssert_(ScriptApp.getScriptId() === FORGE_BUILDER_RESTORATION.CONTROLLER_SCRIPT_ID, 'Installer is running in the wrong Apps Script project.');

    const pull = forgeBuilderRestoreMergedPullRequest_();
    const checks = forgeBuilderRestoreCheckGate_(pull.head.sha);
    const ref = pull.merge_commit_sha || pull.head.sha;
    const manifest = JSON.parse(forgeBuilderRestoreReadRepoText_(FORGE_BUILDER_RESTORATION.MANIFEST_PATH, ref));
    forgeBuilderRestoreManifestGate_(manifest, pull);

    const builderSource = forgeBuilderRestoreReadRepoText_(FORGE_BUILDER_RESTORATION.BUILDER_REPO_PATH, ref);
    const builderHash = forgeSha256_(builderSource);
    forgeAssert_(builderHash === manifest.builderSha256, 'Merged Builder source hash does not match the locked restoration manifest.');
    forgeBuilderRestoreSourceGate_(builderSource);

    before = forgeGetScriptContent(FORGE_BUILDER_RESTORATION.CONTROLLER_SCRIPT_ID);
    forgeBuilderRestoreCurrentProjectGate_(before);
    const candidateFiles = forgeBuilderRestoreCandidateFiles_(before.files, builderSource);
    forgeBuilderRestorePreservationGate_(before.files, candidateFiles, builderHash);
    forgeBuilderRestoreDuplicateFunctionGate_(candidateFiles);
    forgeBuilderRestorePackageGate_(candidateFiles);

    rollback = forgeCreateScriptVersion(
      FORGE_BUILDER_RESTORATION.CONTROLLER_SCRIPT_ID,
      'Rollback before ' + FORGE_BUILDER_RESTORATION.TASK_ID + ' permanent Builder installation'
    );

    props.setProperty(FORGE_BUILDER_RESTORATION.INSTALL_STATE_KEY, forgeStableJson_({
      status: 'VERIFYING',
      taskId: FORGE_BUILDER_RESTORATION.TASK_ID,
      sourceSha256: builderHash,
      mergeCommitSha: ref,
      pullRequestNumber: pull.number,
      rollbackVersion: rollback.version,
      startedAt: new Date().toISOString(),
      automaticMerge: false,
      automaticProductionDeployment: false,
      productionTouched: false
    }));

    forgeBuilderRestorePutContent_(candidateFiles);
    candidateWritten = true;
    const after = forgeGetScriptContent(FORGE_BUILDER_RESTORATION.CONTROLLER_SCRIPT_ID);
    forgeBuilderRestorePreservationGate_(before.files, after.files, builderHash);

    const installedVersion = forgeCreateScriptVersion(
      FORGE_BUILDER_RESTORATION.CONTROLLER_SCRIPT_ID,
      FORGE_BUILDER_RESTORATION.TASK_ID + ' permanent Builder isolated runtime test'
    );
    const deployment = forgeBuilderRestoreCreateExecutionDeployment_(installedVersion.version.versionNumber);
    isolatedDeploymentId = deployment.deploymentId;
    const runtime = forgeBuilderRestoreRunSelfTest_(deployment.deploymentId);
    forgeAssert_(runtime && runtime.ok === true, 'Permanent Builder runtime self-test did not return an explicit passing receipt.');
    forgeAssert_(runtime.productionTouched === false, 'Runtime self-test reported production mutation.');
    forgeAssert_(runtime.automaticMerge === false, 'Runtime self-test reported automatic merge enabled.');
    forgeAssert_(runtime.automaticProductionDeployment === false, 'Runtime self-test reported automatic production deployment enabled.');

    const receipt = {
      status: 'VERIFIED',
      taskId: FORGE_BUILDER_RESTORATION.TASK_ID,
      sourceSha256: builderHash,
      controllerPackageHash: after.packageHash,
      mergeCommitSha: ref,
      pullRequestNumber: pull.number,
      pullRequestUrl: pull.html_url,
      rollbackVersion: rollback.version,
      installedVersion: installedVersion.version,
      executionDeploymentId: deployment.deploymentId,
      checks: checks,
      installedAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      automaticMerge: false,
      automaticProductionDeployment: false,
      engineActivationPerformed: false,
      productionTouched: false
    };
    props.setProperty(FORGE_BUILDER_RESTORATION.INSTALL_STATE_KEY, forgeStableJson_(receipt));
    forgeBuilderRestoreMarkControlSheetVerified_(receipt);
    return Object.assign({ ok: true, installerVersion: FORGE_BUILDER_RESTORATION.VERSION }, receipt, {
      existingControllerSourceFilesPreserved: true,
      manifestExecutionApiAdded: true,
      codeFileOverwritten: false,
      temporaryPulseFilesRemoved: false,
      isolatedTestDeploymentCreated: true,
      productionDeploymentCreated: false
    });
  } catch (error) {
    let rollbackResult = null;
    if (isolatedDeploymentId) {
      try { forgeBuilderRestoreDeleteExecutionDeployment_(isolatedDeploymentId); } catch (_deleteError) {}
    }
    if (candidateWritten && before && before.files) {
      try {
        forgeBuilderRestorePutContent_(before.files);
        const restored = forgeGetScriptContent(FORGE_BUILDER_RESTORATION.CONTROLLER_SCRIPT_ID);
        forgeAssert_(restored.packageHash === before.packageHash, 'Automatic rollback package hash mismatch.');
        rollbackResult = { ok: true, restoredPackageHash: restored.packageHash };
      } catch (rollbackError) {
        rollbackResult = { ok: false, error: forgeBuilderRestoreCleanError_(rollbackError) };
      }
    }
    if (previousStateRaw) props.setProperty(FORGE_BUILDER_RESTORATION.INSTALL_STATE_KEY, previousStateRaw);
    else props.deleteProperty(FORGE_BUILDER_RESTORATION.INSTALL_STATE_KEY);
    throw new Error(
      'Permanent Builder installation failed closed: ' + forgeBuilderRestoreCleanError_(error) +
      '. Rollback: ' + JSON.stringify(rollbackResult || { ok: true, notNeeded: true })
    );
  } finally {
    lock.releaseLock();
  }
}

/** Explicit rollback only. Never runs automatically after a verified install. */
function forgeRollbackPermanentBuilderInstallation() {
  const raw = PropertiesService.getScriptProperties().getProperty(FORGE_BUILDER_RESTORATION.INSTALL_STATE_KEY);
  forgeAssert_(raw, 'No permanent Builder installation receipt exists.');
  const state = JSON.parse(raw);
  forgeAssert_(state.rollbackVersion && state.rollbackVersion.versionNumber, 'Installation receipt has no rollback version.');
  const rollbackContent = forgeGetScriptContent(
    FORGE_BUILDER_RESTORATION.CONTROLLER_SCRIPT_ID,
    state.rollbackVersion.versionNumber
  );
  forgeAssert_(rollbackContent.files && rollbackContent.files.length > 0, 'Rollback version content could not be read.');
  forgeBuilderRestorePutContent_(rollbackContent.files);
  const verified = forgeGetScriptContent(FORGE_BUILDER_RESTORATION.CONTROLLER_SCRIPT_ID);
  forgeAssert_(verified.packageHash === rollbackContent.packageHash, 'Explicit rollback verification failed.');
  state.status = 'ROLLED_BACK';
  state.rolledBackAt = new Date().toISOString();
  state.restoredPackageHash = verified.packageHash;
  PropertiesService.getScriptProperties().setProperty(
    FORGE_BUILDER_RESTORATION.INSTALL_STATE_KEY,
    forgeStableJson_(state)
  );
  return {
    ok: true,
    status: state.status,
    restoredPackageHash: verified.packageHash,
    automaticMerge: false,
    isolatedTestDeploymentCreated: false,
    productionDeploymentCreated: false,
    productionTouched: false
  };
}

function forgeBuilderRestorationStatus() {
  const raw = PropertiesService.getScriptProperties().getProperty(FORGE_BUILDER_RESTORATION.INSTALL_STATE_KEY);
  let state = {};
  try { state = raw ? JSON.parse(raw) : {}; } catch (error) { state = { status: 'INVALID', error: error.message }; }
  return {
    ok: state.status === 'VERIFIED',
    status: state.status || 'NOT_INSTALLED',
    taskId: FORGE_BUILDER_RESTORATION.TASK_ID,
    sourceSha256: state.sourceSha256 || '',
    mergeCommitSha: state.mergeCommitSha || '',
    rollbackVersion: state.rollbackVersion || null,
    automaticMerge: false,
    automaticProductionDeployment: false,
    productionTouched: false,
    writesPerformed: false
  };
}

function forgeBuilderRestoreDependencyGate_() {
  const required = [
    'forgeAssert_',
    'forgeString_',
    'forgeSha256_',
    'forgeStableJson_',
    'forgeCanonicalFiles_',
    'forgeFileInventory_',
    'forgePackageHash_',
    'forgeValidatePackage',
    'forgeGitHubConnectionTest',
    'forgeGitHubApi_',
    'forgeGetScriptContent',
    'forgeCreateScriptVersion',
    'forgeListDeployments',
    'forgeApiFetch_'
  ];
  const scope = typeof globalThis !== 'undefined' ? globalThis : this;
  const missing = required.filter(function(name) { return typeof scope[name] !== 'function'; });
  forgeAssert_(missing.length === 0, 'Missing installed Forge dependencies: ' + missing.join(', '));
  const connection = forgeGitHubConnectionTest();
  forgeAssert_(connection.ok === true && connection.repository === FORGE_BUILDER_RESTORATION.REPOSITORY, 'GitHub connection is not locked to the Pulse repository.');
}

function forgeBuilderRestoreMergedPullRequest_() {
  const owner = FORGE_BUILDER_RESTORATION.REPOSITORY.split('/')[0];
  const pulls = forgeGitHubApi_(
    '/pulls?state=all&head=' + encodeURIComponent(owner + ':' + FORGE_BUILDER_RESTORATION.RESTORATION_BRANCH) +
      '&base=' + encodeURIComponent(FORGE_BUILDER_RESTORATION.BASE_BRANCH) + '&per_page=100',
    { method: 'get' }
  ) || [];
  const matches = pulls.filter(function(pull) {
    return pull && pull.head && pull.head.ref === FORGE_BUILDER_RESTORATION.RESTORATION_BRANCH;
  });
  forgeAssert_(matches.length === 1, 'Exactly one restoration pull request must exist.');
  forgeAssert_(matches[0].merged_at, 'Restoration pull request is not merged.');
  return matches[0];
}

function forgeBuilderRestoreCheckGate_(sha) {
  const response = forgeGitHubApi_('/commits/' + encodeURIComponent(sha) + '/check-runs?per_page=100', { method: 'get' });
  const runs = response && response.check_runs ? response.check_runs : [];
  const byName = {};
  runs.forEach(function(run) { byName[forgeString_(run.name)] = run; });
  const results = FORGE_BUILDER_RESTORATION.REQUIRED_CHECKS.map(function(name) {
    const run = byName[name];
    forgeAssert_(run && run.status === 'completed' && run.conclusion === 'success', 'Required restoration CI check did not pass: ' + name);
    return { name: name, conclusion: run.conclusion, completedAt: run.completed_at || '' };
  });
  return results;
}

function forgeBuilderRestoreManifestGate_(manifest, pull) {
  forgeAssert_(manifest && manifest.schemaVersion === 1, 'Restoration manifest schemaVersion must be 1.');
  forgeAssert_(manifest.taskId === FORGE_BUILDER_RESTORATION.TASK_ID, 'Restoration manifest task ID mismatch.');
  forgeAssert_(manifest.repository === FORGE_BUILDER_RESTORATION.REPOSITORY, 'Restoration manifest repository mismatch.');
  forgeAssert_(manifest.branch === FORGE_BUILDER_RESTORATION.RESTORATION_BRANCH, 'Restoration manifest branch mismatch.');
  forgeAssert_(manifest.builderPath === FORGE_BUILDER_RESTORATION.BUILDER_REPO_PATH, 'Restoration manifest Builder path mismatch.');
  forgeAssert_(/^[a-f0-9]{64}$/.test(forgeString_(manifest.builderSha256)), 'Restoration manifest requires builderSha256.');
  forgeAssert_(manifest.install && manifest.install.preserveCodeGs === true, 'Manifest must preserve Code.gs.');
  forgeAssert_(manifest.install.separatePermanentFile === true, 'Manifest must install a separate permanent file.');
  forgeAssert_(manifest.install.removeTemporaryFiles === false, 'Manifest cannot remove temporary files.');
  forgeAssert_(manifest.safety && manifest.safety.automaticMerge === false, 'Manifest automaticMerge must be false.');
  forgeAssert_(manifest.safety.productionDeployment === false, 'Manifest productionDeployment must be false.');
  forgeAssert_(manifest.safety.engineActivation === false, 'Manifest engineActivation must be false.');
  forgeAssert_(manifest.safety.productionDataMutation === false, 'Manifest productionDataMutation must be false.');
  forgeAssert_(pull.head && pull.head.ref === manifest.branch, 'Merged PR branch does not match the manifest.');
}

function forgeBuilderRestoreSourceGate_(source) {
  const required = [
    'function runNextReadyTask()',
    'function forgePermanentBuilderSelfTest(options)',
    'function forgePermanentBuilderInstallationStatus()',
    'function forgeBuilderRecordPhoneTest(request)',
    "MAX_REPAIR_ATTEMPTS: 3",
    "automaticMerge: false",
    "automaticProductionDeployment: false",
    "productionTouched: false"
  ];
  required.forEach(function(marker) {
    forgeAssert_(source.indexOf(marker) >= 0, 'Builder source is missing required marker: ' + marker);
  });
  const forbidden = [
    'merge_pull_request',
    '/merges',
    'AUTOMATIC_MERGE: true',
    'AUTOMATIC_PRODUCTION_DEPLOYMENT: true',
    'forgeSetActiveEngineSlot(',
    'forgeValidateAndActivateEngine(',
    'MailApp.',
    'CalendarApp.'
  ];
  forbidden.forEach(function(marker) {
    forgeAssert_(source.indexOf(marker) < 0, 'Builder source contains forbidden marker: ' + marker);
  });
}

function forgeBuilderRestoreCurrentProjectGate_(content) {
  forgeAssert_(content && Array.isArray(content.files), 'Current controller content could not be read.');
  forgeAssert_(content.files.length > 0 && content.files.length <= FORGE_BUILDER_RESTORATION.MAX_FILES, 'Current controller file count is outside the restoration limit.');
  const code = content.files.filter(function(file) { return file.name === 'Code' && file.type === 'SERVER_JS'; });
  const installer = content.files.filter(function(file) { return file.name === FORGE_BUILDER_RESTORATION.INSTALLER_FILE_NAME && file.type === 'SERVER_JS'; });
  forgeAssert_(code.length === 1, 'Exactly one Code.gs file must be present.');
  forgeAssert_(installer.length === 1, 'The one-time PermanentBuilderInstaller file must be present before installation.');
}

function forgeBuilderRestoreCandidateFiles_(currentFiles, builderSource) {
  const files = (currentFiles || []).filter(function(file) {
    return file.name !== FORGE_BUILDER_RESTORATION.BUILDER_FILE_NAME;
  }).map(function(file) {
    if (file.name === 'appsscript' && file.type === 'JSON') {
      const manifest = JSON.parse(file.source);
      manifest.executionApi = Object.assign({}, manifest.executionApi || {}, { access: 'MYSELF' });
      return { name: file.name, type: file.type, source: JSON.stringify(manifest, null, 2) };
    }
    return { name: file.name, type: file.type, source: file.source };
  });
  files.push({
    name: FORGE_BUILDER_RESTORATION.BUILDER_FILE_NAME,
    type: 'SERVER_JS',
    source: builderSource
  });
  return forgeCanonicalFiles_(files);
}

function forgeBuilderRestorePreservationGate_(beforeFiles, afterFiles, expectedBuilderHash) {
  const before = {};
  const after = {};
  forgeFileInventory_(beforeFiles || []).forEach(function(file) { before[file.name] = file; });
  forgeFileInventory_(afterFiles || []).forEach(function(file) { after[file.name] = file; });
  Object.keys(before).forEach(function(name) {
    if (name === FORGE_BUILDER_RESTORATION.BUILDER_FILE_NAME) return;
    forgeAssert_(after[name], 'Existing controller file was removed: ' + name);
    if (name === 'appsscript') return;
    forgeAssert_(after[name].sha256 === before[name].sha256, 'Existing controller file changed: ' + name);
  });
  const beforeManifestFile = (beforeFiles || []).filter(function(file) { return file.name === 'appsscript' && file.type === 'JSON'; })[0];
  const afterManifestFile = (afterFiles || []).filter(function(file) { return file.name === 'appsscript' && file.type === 'JSON'; })[0];
  forgeAssert_(beforeManifestFile && afterManifestFile, 'Controller appsscript.json must be preserved.');
  const beforeManifest = JSON.parse(beforeManifestFile.source);
  const afterManifest = JSON.parse(afterManifestFile.source);
  const beforeComparable = JSON.parse(JSON.stringify(beforeManifest));
  const afterComparable = JSON.parse(JSON.stringify(afterManifest));
  delete beforeComparable.executionApi;
  delete afterComparable.executionApi;
  forgeAssert_(forgeStableJson_(beforeComparable) === forgeStableJson_(afterComparable), 'Controller manifest changed outside the executionApi entry.');
  forgeAssert_(afterManifest.executionApi && afterManifest.executionApi.access === 'MYSELF', 'Controller manifest must expose a MYSELF API Executable entry point for the isolated runtime test.');
  forgeAssert_(after[FORGE_BUILDER_RESTORATION.BUILDER_FILE_NAME], 'Permanent Builder file was not installed.');
  forgeAssert_(after[FORGE_BUILDER_RESTORATION.BUILDER_FILE_NAME].sha256 === expectedBuilderHash, 'Installed Builder file hash mismatch.');
  forgeAssert_(after.Code && before.Code && after.Code.sha256 === before.Code.sha256, 'Code.gs was overwritten.');
}

function forgeBuilderRestoreDuplicateFunctionGate_(files) {
  const seen = {};
  (files || []).filter(function(file) { return file.type === 'SERVER_JS'; }).forEach(function(file) {
    forgeBuilderRestoreFunctionNames_(file.source).forEach(function(name) {
      seen[name] = seen[name] || [];
      seen[name].push(file.name);
    });
  });
  const duplicates = Object.keys(seen).filter(function(name) { return seen[name].length > 1; });
  forgeAssert_(duplicates.length === 0, 'Duplicate server functions would be installed: ' + duplicates.map(function(name) {
    return name + ' in ' + seen[name].join(', ');
  }).join(' | '));
  forgeAssert_(seen.runNextReadyTask && seen.runNextReadyTask.length === 1 && seen.runNextReadyTask[0] === FORGE_BUILDER_RESTORATION.BUILDER_FILE_NAME, 'runNextReadyTask must exist exactly once in SelfValidatingBuilder.');
}

function forgeBuilderRestorePackageGate_(candidateFiles) {
  const manifest = candidateFiles.filter(function(file) { return file.name === 'appsscript' && file.type === 'JSON'; })[0];
  forgeAssert_(manifest, 'Controller appsscript.json is missing.');
  const builder = candidateFiles.filter(function(file) { return file.name === FORGE_BUILDER_RESTORATION.BUILDER_FILE_NAME; })[0];
  const validation = forgeValidatePackage({
    packageId: FORGE_BUILDER_RESTORATION.TASK_ID,
    files: [manifest, builder],
    requiredFunctions: ['runNextReadyTask', 'forgePermanentBuilderSelfTest']
  });
  forgeAssert_(validation.ok === true, 'Permanent Builder package validation failed: ' + (validation.problems || []).join(' | '));
}

function forgeBuilderRestorePutContent_(files) {
  const result = forgeApiFetch_(
    'https://script.googleapis.com/v1/projects/' + encodeURIComponent(FORGE_BUILDER_RESTORATION.CONTROLLER_SCRIPT_ID) + '/content',
    {
      method: 'put',
      payload: {
        files: forgeCanonicalFiles_(files).map(function(file) {
          return { name: file.name, type: file.type, source: file.source };
        })
      }
    }
  );
  forgeAssert_(result && result.scriptId === FORGE_BUILDER_RESTORATION.CONTROLLER_SCRIPT_ID, 'Apps Script content update returned the wrong script ID.');
  return result;
}

function forgeBuilderRestoreCreateExecutionDeployment_(versionNumber) {
  const result = forgeApiFetch_(
    'https://script.googleapis.com/v1/projects/' + encodeURIComponent(FORGE_BUILDER_RESTORATION.CONTROLLER_SCRIPT_ID) + '/deployments',
    {
      method: 'post',
      payload: {
        versionNumber: Number(versionNumber),
        manifestFileName: 'appsscript',
        description: FORGE_BUILDER_RESTORATION.TASK_ID + ' permanent Builder isolated runtime test'
      }
    }
  );
  forgeAssert_(result && result.deploymentId, 'Isolated API Executable test deployment was not created.');
  const entries = result.entryPoints || [];
  forgeAssert_(entries.some(function(entry) {
    return forgeString_(entry.entryPointType).toUpperCase() === 'EXECUTION_API';
  }), 'Isolated deployment did not expose an EXECUTION_API entry point.');
  return result;
}

function forgeBuilderRestoreDeleteExecutionDeployment_(deploymentId) {
  return forgeApiFetch_(
    'https://script.googleapis.com/v1/projects/' + encodeURIComponent(FORGE_BUILDER_RESTORATION.CONTROLLER_SCRIPT_ID) +
      '/deployments/' + encodeURIComponent(deploymentId),
    { method: 'delete' }
  );
}

function forgeBuilderRestoreRunSelfTest_(deploymentId) {
  const result = forgeApiFetch_(
    'https://script.googleapis.com/v1/scripts/' + encodeURIComponent(deploymentId) + ':run',
    {
      method: 'post',
      payload: {
        function: 'forgePermanentBuilderSelfTest',
        parameters: [{ installationProbe: true }],
        devMode: false
      }
    }
  );
  if (result && result.error) {
    const detail = result.error.details && result.error.details.length ? result.error.details[0] : {};
    throw new Error(detail.errorMessage || result.error.message || JSON.stringify(result.error));
  }
  return result && result.response ? result.response.result : null;
}

function forgeBuilderRestoreMarkControlSheetVerified_(receipt) {
  const ss = SpreadsheetApp.openById(FORGE_BUILDER_RESTORATION.CONTROL_SHEET_ID);
  const tasks = ss.getSheetByName('Tasks');
  forgeAssert_(tasks, 'Tasks sheet is missing.');
  const values = tasks.getDataRange().getValues();
  const headers = values[0].map(String);
  const map = {};
  headers.forEach(function(header, index) { map[header] = index; });
  let rowNumber = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (forgeString_(values[i][map['Task ID']]) === 'PULSE-080') {
      rowNumber = i + 1;
      break;
    }
  }
  forgeAssert_(rowNumber > 0, 'PULSE-080 task row was not found.');
  const updates = {
    Status: 'READY_TO_RUN',
    'Assigned Agent': 'Pulse Forge Permanent Builder',
    'Branch / Build': 'BUILDER_VERIFIED_WAITING_TASK_PACKAGE',
    'Last Error': '',
    'Updated At': new Date(),
    'Integration Hooks': 'BUILDER_VERIFIED=' + receipt.sourceSha256 + '; MERGE_COMMIT=' + receipt.mergeCommitSha + '; NO_DEPLOYMENT; NO_PRODUCTION'
  };
  Object.keys(updates).forEach(function(header) {
    if (map[header] !== undefined) tasks.getRange(rowNumber, map[header] + 1).setValue(updates[header]);
  });

  const logs = ss.getSheetByName('Logs');
  if (logs) {
    const logHeaders = logs.getRange(1, 1, 1, logs.getLastColumn()).getValues()[0].map(String);
    const logValues = {
      'Logged At': new Date(),
      Level: 'INFO',
      Agent: 'FORGE_BUILDER_RESTORATION',
      'Task ID': FORGE_BUILDER_RESTORATION.TASK_ID,
      Stage: 'VERIFIED',
      Message: 'Permanent SelfValidatingBuilder installed as a separate file and passed runtime self-test.',
      'Context JSON': JSON.stringify(receipt),
      'Duration MS': 0,
      'Retry Count': 0,
      'Run ID': Utilities.getUuid()
    };
    logs.appendRow(logHeaders.map(function(header) { return logValues[header] !== undefined ? logValues[header] : ''; }));
  }
}

function forgeBuilderRestoreReadRepoText_(path, ref) {
  const encoded = forgeString_(path).split('/').map(encodeURIComponent).join('/');
  const result = forgeGitHubApi_('/contents/' + encoded + '?ref=' + encodeURIComponent(ref), { method: 'get' });
  forgeAssert_(result && result.content && result.encoding === 'base64', 'GitHub file content was not returned for ' + path);
  return Utilities.newBlob(Utilities.base64Decode(forgeString_(result.content).replace(/\s/g, ''))).getDataAsString('UTF-8');
}

function forgeBuilderRestoreFunctionNames_(source) {
  const names = [];
  const regex = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  let match;
  while ((match = regex.exec(forgeString_(source)))) names.push(match[1]);
  return names;
}

function forgeBuilderRestoreCleanError_(error) {
  return error && error.message ? String(error.message) : String(error || 'Unknown error');
}
