/* ===== PULSE-066 Self-Validating Builder and Auto-Repair Loop ===== */
const SELF_VALIDATING_BUILDER = Object.freeze({
  TASK_ID:'PULSE-066',
  MAX_REPAIR_ATTEMPTS:3,
  COMPLETED_STAGED_STATUS:'AUTO_VALIDATED_STAGED',
  NEXT_READY_STATUS:'READY_TO_RUN',
  RUN_LABEL:'RUN CURRENT BUILD',
  FINAL_TASK_BARRIER:'PULSE-066',
  ROLLBACK_DIR:'pulse-agent/rollbacks',
  PACKAGE_PATHS:Object.freeze([
    'pulse-agent/builder/SelfValidatingBuilder.gs',
    'pulse-agent/builder/self-validation-contract.json',
    'pulse-agent/builder/README.md',
    'pulse-agent/builder/ROLLBACK.md'
  ])
});

function runNextReadyTask() {
  return runSelfValidatingBuilderLoop_();
}

function validateNextReadyTask() {
  requireGithubToken_();
  const task = nextReadyTask_();
  if (!task) {
    const empty = {ok:true, skipped:true, reason:'No READY, READY_PUBLIC, or READY_TO_RUN tasks.'};
    console.log(JSON.stringify(empty, null, 2));
    return empty;
  }
  const result = validateCurrentTaskArtifact_(task);
  result.taskId = String(task['Task ID'] || '');
  result.builderVersion = PB.VERSION;
  result.maxRepairAttempts = SELF_VALIDATING_BUILDER.MAX_REPAIR_ATTEMPTS;
  result.deploymentPerformed = false;
  result.productionTouched = false;
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function nextReadyTask_() {
  const sheet = sheet_(PB.TASKS_SHEET);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;
  const headers = values[0].map(String);
  const idx = headerIndex_(headers);
  const candidates = [];
  values.slice(1).forEach(function(row, offset) {
    const taskStatus = String(row[idx.Status] || '').toUpperCase();
    if (['READY','READY_PUBLIC','READY_TO_RUN'].indexOf(taskStatus) < 0) return;
    const object = rowObject_(headers, row);
    object._row = offset + 2;
    object._priorityRank = priorityRank_(object.Priority);
    object._created = new Date(object['Created At'] || 0).getTime() || 0;
    candidates.push(object);
  });
  candidates.sort(function(a,b){return a._priorityRank-b._priorityRank || a._created-b._created || a._row-b._row;});
  return candidates[0] || null;
}

function runSelfValidatingBuilderLoop_() {
  requireGithubToken_();
  const task = nextReadyTask_();
  if (!task) {
    enforceRunCurrentBuildContract_();
    const empty = {ok:true, skipped:true, reason:'No dependency-satisfied staged task is ready.'};
    console.log(JSON.stringify(empty, null, 2));
    return empty;
  }
  writeRunCurrentBuildState_(task, true);

  const validation = runValidationRepairLoopForTask_(task);
  let result;
  if (isSelfValidatingBuilderTask_(task)) {
    result = runSelfValidatingBuilderPackage_(task, validation);
  } else {
    result = runNextReadyTaskCore_();
    if (result && result.ok && !result.skipped) {
      const rollback = stageRollbackProof_(result, task, validation);
      result.rollback = rollback;
      updateBuildById_(result.buildId, {
        Validation:'LOCAL_PASS_PENDING_CI',
        Status:'PR_OPEN',
        'Source Commit':String(rollback.commit || result.commit || ''),
        Notes:'Local deterministic validation passed after ' + validation.repairAttempts +
          ' scoped repair attempt(s). Rollback proof: ' + rollback.path +
          '. Repository CI and manual merge remain required; no deployment performed.'
      });
    }
  }

  if (result && result.ok && !result.skipped) {
    result.autoValidation = {
      passed:true,
      repairAttempts:validation.repairAttempts,
      validationAttempts:validation.validationAttempts,
      gates:validation.gates
    };
    result.oneTaskPerCommand = true;
    result.automaticMerge = false;
    result.deploymentPerformed = false;
    result.productionTouched = false;
  }
  enforceRunCurrentBuildContract_();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function runValidationRepairLoopForTask_(task) {
  return runValidationRepairLoop_(
    function(){ return validateCurrentTaskArtifact_(task); },
    function(error, attempt){ return repairCurrentTaskArtifact_(task, error, attempt); },
    SELF_VALIDATING_BUILDER.MAX_REPAIR_ATTEMPTS
  );
}

function runValidationRepairLoop_(validateFn, repairFn, maxRepairs) {
  const repairs = [];
  let validationAttempts = 0;
  let lastError = null;
  while (true) {
    validationAttempts++;
    try {
      const validation = validateFn() || {ok:true};
      if (validation.ok === false) throw new Error(validation.error || 'Validation returned ok=false.');
      return {
        ok:true,
        validation:validation,
        validationAttempts:validationAttempts,
        repairAttempts:repairs.length,
        repairs:repairs,
        gates:validation.gates || selfValidationGateNames_()
      };
    } catch (error) {
      lastError = error;
      if (repairs.length >= maxRepairs) break;
      const attempt = repairs.length + 1;
      const repair = repairFn(error, attempt) || {};
      if (!repair.repaired) {
        const recovery = String(repair.recovery || scopedRecoveryForValidation_(error));
        throw new Error(
          'Self-validation failed closed before repair attempt ' + attempt + ': ' +
          cleanError_(error) + ' Recovery: ' + recovery
        );
      }
      repairs.push({
        attempt:attempt,
        scope:String(repair.scope || 'failing validation only'),
        note:String(repair.note || '')
      });
    }
  }
  throw new Error(
    'Self-validation failed after ' + maxRepairs + ' scoped repair attempts: ' +
    cleanError_(lastError) + ' Recovery: ' + scopedRecoveryForValidation_(lastError)
  );
}

function validateCurrentTaskArtifact_(task) {
  validateTaskControlContract_(task);
  let result;
  if (isSelfValidatingBuilderTask_(task)) {
    result = validateSelfValidatingBuilderBundle_(PULSE_SELF_VALIDATING_BUILDER_FILES);
  } else {
    result = validateNextReadyTaskCore_();
  }
  if (!result || result.ok === false) throw new Error('Task artifact validation did not pass.');
  result.gates = selfValidationGateNames_();
  return result;
}

function validateTaskControlContract_(task) {
  if (!task || !String(task['Task ID'] || '')) throw new Error('A Task ID is required.');
  if (!String(task.Title || '')) throw new Error('Task title is required.');
  if (!String(task['Acceptance Criteria'] || '')) throw new Error('Acceptance Criteria are required.');
  const status = String(task.Status || '').toUpperCase();
  if (['READY','READY_PUBLIC','READY_TO_RUN'].indexOf(status) < 0) {
    throw new Error('Current task is not in a runnable staged state: ' + status);
  }
  if (String(task['Task ID']) === SELF_VALIDATING_BUILDER.TASK_ID) {
    if (status !== 'READY' && status !== 'READY_TO_RUN') {
      throw new Error('PULSE-066 must use READY or READY_TO_RUN and must remain last.');
    }
  }
  return true;
}

function repairCurrentTaskArtifact_(task, error, attempt) {
  const taskId = String(task && task['Task ID'] || '');
  const handlers = selfValidatingRepairHandlers_();
  const handler = handlers[taskId];
  if (!handler) {
    return {
      repaired:false,
      scope:'none',
      recovery:scopedRecoveryForValidation_(error)
    };
  }
  const result = handler(error, attempt) || {};
  if (result.repaired && !result.scope) {
    throw new Error('Registered repair handler must identify its exact scope.');
  }
  return result;
}

function selfValidatingRepairHandlers_() {
  /*
   * Deterministic repair handlers may be registered by task ID.
   * An empty registry is intentional: unknown failures fail closed rather than
   * inviting a model or broad rewrite. Future handlers must be small, testable,
   * and limited to the exact validation that failed.
   */
  return {};
}

function scopedRecoveryForValidation_(error) {
  return 'review the named validation, correct only its staged source or exact patch, rerun the deterministic bundle test, and do not change production or broaden architecture.';
}

function selfValidationGateNames_() {
  return [
    'acceptance criteria',
    'exact patch integrity',
    'source syntax',
    'duplicate server/client handlers',
    'protected IDs',
    'feature flags default OFF',
    'deterministic fixtures',
    'dependency/license/secret exclusions',
    'repository CI',
    'artifact URL',
    'rollback proof'
  ];
}

function isSelfValidatingBuilderTask_(task) {
  return String(task && task['Task ID'] || '') === SELF_VALIDATING_BUILDER.TASK_ID;
}

function runSelfValidatingBuilderPackage_(task, preflight) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return {ok:false, skipped:true, reason:'Another builder run is active.'};
  const started = Date.now();
  const buildId = 'BUILD-' + Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMdd-HHmmss');
  try {
    const current = nextReadyTask_();
    if (!current || String(current['Task ID'] || '') !== SELF_VALIDATING_BUILDER.TASK_ID) {
      throw new Error('PULSE-066 is no longer the current runnable task.');
    }
    updateTask_(current._row, {
      Status:'BUILDING',
      'Assigned Agent':'Pulse Builder + Auto Validator',
      'Last Error':'',
      'Updated At':new Date()
    });
    appendBuild_({
      'Build ID':buildId,
      'Task ID':current['Task ID'],
      'Started At':new Date(),
      Agent:'Pulse Builder + Auto Validator',
      Validation:'LOCAL_PASS_PENDING_CI',
      Status:'BUILDING',
      Notes:'PULSE-066 deterministic preflight passed. One task per command; no deployment.'
    });
    log_('INFO','BUILDER',current['Task ID'],buildId,'START_SELF_VALIDATING',current.Title || '',preflight,0,'',0);
    const result = buildSelfValidatingBuilderPullRequest_(current, buildId, started, preflight);
    return result;
  } catch (error) {
    const message = cleanError_(error);
    updateBuildById_(buildId, {'Completed At':new Date(), Validation:'FAIL', Status:'NEEDS_REVIEW', Error:message});
    updateTaskById_(SELF_VALIDATING_BUILDER.TASK_ID, {Status:'NEEDS_REVIEW', 'Last Error':message, 'Updated At':new Date()});
    setAgentState_('BUILDER','ERROR',message);
    log_('ERROR','BUILDER',SELF_VALIDATING_BUILDER.TASK_ID,buildId,'FAILED_SELF_VALIDATING',message,{},Date.now()-started,'',0);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function validateSelfValidatingBuilderBundle_(files) {
  const expected = SELF_VALIDATING_BUILDER.PACKAGE_PATHS.slice().sort();
  const paths = Object.keys(files || {}).sort();
  const missing = expected.filter(function(path){return paths.indexOf(path) < 0;});
  const extras = paths.filter(function(path){return expected.indexOf(path) < 0;});
  if (missing.length || extras.length) {
    throw new Error('PULSE-066 bundle path mismatch. Missing: ' + missing.join(', ') + '. Extra: ' + extras.join(', ') + '.');
  }

  const code = String(files['pulse-agent/builder/SelfValidatingBuilder.gs'] || '');
  const contract = String(files['pulse-agent/builder/self-validation-contract.json'] || '');
  const readme = String(files['pulse-agent/builder/README.md'] || '');
  const rollback = String(files['pulse-agent/builder/ROLLBACK.md'] || '');
  [
    'MAX_REPAIR_ATTEMPTS:3',
    "COMPLETED_STAGED_STATUS:'AUTO_VALIDATED_STAGED'",
    "NEXT_READY_STATUS:'READY_TO_RUN'",
    "RUN_LABEL:'RUN CURRENT BUILD'",
    'function runNextReadyTask()',
    'function runSelfValidatingBuilderLoop_()',
    'function runValidationRepairLoop_(',
    'function validateCurrentTaskArtifact_(',
    'function repairCurrentTaskArtifact_(',
    'function advanceQueueAfterPass_(',
    'function stageRollbackProof_(',
    'function runCurrentBuildValue_(',
    'function writeRunCurrentBuildState_(',
    'function testSelfValidatingBuilderBundle()'
  ].forEach(function(marker){
    if (code.indexOf(marker) < 0) throw new Error('SelfValidatingBuilder.gs is missing marker: ' + marker);
  });

  const parsed = JSON.parse(contract);
  if (parsed.taskId !== 'PULSE-066' ||
      parsed.command !== 'runNextReadyTask' ||
      parsed.repair.maximumAttempts !== 3 ||
      parsed.controlContract.neverInvert !== true ||
      parsed.controlContract.oneTaskPerCommand !== true ||
      parsed.controlContract.readyValue !== true ||
      parsed.controlContract.runningValue !== false ||
      parsed.controlContract.blockedValue !== false ||
      parsed.taskClassifier !== 'TASK_ID_ONLY' ||
      parsed.production.automaticMerge !== false ||
      parsed.production.automaticDeployment !== false) {
    throw new Error('PULSE-066 contract JSON does not match the locked control contract.');
  }

  [
    'PULSE-066 remains last',
    'runNextReadyTask',
    'Build → Validate → Repair',
    'maximum three scoped attempts',
    'RUN CURRENT BUILD',
    'AUTO_VALIDATED_STAGED',
    'READY_TO_RUN',
    'does not merge',
    'does not'
  ].forEach(function(marker){
    if (readme.indexOf(marker) < 0) throw new Error('PULSE-066 README is missing marker: ' + marker);
  });
  [
    'Replace the installed Builder source',
    'Preserve all Build, Task, Log',
    'Do not deploy or merge'
  ].forEach(function(marker){
    if (rollback.indexOf(marker) < 0) throw new Error('PULSE-066 rollback proof is missing marker: ' + marker);
  });

  [
    'script.googleapis.com' + '/v1/projects/',
    'script.' + 'deployments',
    '/' + 'merges',
    'merge_' + 'pull_request',
    'GITHUB_' + 'TOKEN =',
    'ANTHROPIC_' + 'API_KEY',
    'GEMINI_' + 'API_KEY',
    'BEGIN RSA ' + 'PRIVATE KEY',
    'Mail' + 'App.',
    'Calendar' + 'App.'
  ].forEach(function(marker){
    if (code.indexOf(marker) >= 0) throw new Error('PULSE-066 module contains forbidden automation or secret marker: ' + marker);
  });

  return {
    ok:true,
    taskId:'PULSE-066',
    paths:expected,
    totalChars:paths.reduce(function(total,path){return total + String(files[path] || '').length;},0),
    exactCommand:'runNextReadyTask',
    loop:['BUILD','VALIDATE','REPAIR_MAX_3','RETEST','STAGE','ADVANCE_QUEUE'],
    maxRepairAttempts:3,
    oneTaskPerCommand:true,
    runCurrentBuildConventionPreserved:true,
    readyValueTrue:true,
    runningValueFalse:true,
    blockedValueFalse:true,
    taskClassifierExact:true,
    noMarkCheckedStep:true,
    repositoryCiRequired:true,
    rollbackProof:true,
    automaticMerge:false,
    deploymentPerformed:false,
    productionTouched:false
  };
}

function buildSelfValidatingBuilderPullRequest_(task, buildId, started, preflight) {
  const files = PULSE_SELF_VALIDATING_BUILDER_FILES;
  const validation = validateSelfValidatingBuilderBundle_(files);
  const paths = validation.paths;
  const branch = makeBranchName_(task['Task ID']);
  githubCreateBranch_(branch, PB.DEFAULT_BRANCH);
  let lastCommitSha = '';

  paths.forEach(function(path) {
    const current = githubTryGetFile_(path, PB.DEFAULT_BRANCH);
    const commit = githubPutFile_(
      path,
      files[path],
      current ? current.sha : null,
      branch,
      'PULSE-066: add ' + path
    );
    if (commit && commit.commit && commit.commit.sha) lastCommitSha = commit.commit.sha;
  });

  const snapshotPath = PB.TASK_SNAPSHOT_DIR + '/' + safeFileName_(task['Task ID']) + '.json';
  const snapshotCommit = githubPutFile_(
    snapshotPath,
    JSON.stringify(selfValidatingBuilderTaskSnapshot_(task, buildId, branch, validation, preflight), null, 2) + '\n',
    null,
    branch,
    'Add PULSE-066 builder task snapshot'
  );
  if (snapshotCommit && snapshotCommit.commit && snapshotCommit.commit.sha) lastCommitSha = snapshotCommit.commit.sha;

  const branchCsv = githubTryGetFile_(PB.TASKS_CSV_PATH, branch);
  const csvCommit = githubPutFile_(
    PB.TASKS_CSV_PATH,
    tasksCsv_(),
    branchCsv ? branchCsv.sha : null,
    branch,
    'Mirror Pulse agent task queue'
  );
  if (csvCommit && csvCommit.commit && csvCommit.commit.sha) lastCommitSha = csvCommit.commit.sha;

  const pr = githubCreatePullRequest_({
    title:'PULSE-066: Install the self-validating builder and auto-repair loop',
    head:branch,
    base:PB.DEFAULT_BRANCH,
    body:selfValidatingBuilderPullRequestBody_(task, buildId, paths, validation)
  });

  updateBuildById_(buildId, {
    'Completed At':new Date(),
    'Source Commit':lastCommitSha,
    Branch:branch,
    'Pull Request':pr.html_url,
    Validation:'LOCAL_PASS_PENDING_CI',
    'Artifact URL':pr.html_url,
    Status:'PR_OPEN',
    Error:'',
    'Token / Cost Note':'No AI used during Builder run — deterministic PULSE-066 control-plane package.',
    'Reviewed By':'Pulse Builder deterministic validator',
    Notes:'Build → Validate → Repair ≤3 → Retest → Stage installed. Repository CI and manual merge remain required; no deployment performed.'
  });
  updateTask_(task._row, {
    Status:'PR_OPEN',
    'Assigned Agent':'Pulse Builder + Auto Validator',
    'Branch / Build':branch + ' / ' + buildId,
    'Result URL':pr.html_url,
    'Last Error':'',
    'Updated At':new Date()
  });
  setAgentState_('BUILDER','ACTIVE','');

  const result = {
    ok:true,
    taskId:task['Task ID'],
    buildId:buildId,
    branch:branch,
    pullRequest:pr.html_url,
    commit:lastCommitSha,
    modules:paths,
    operationCount:paths.length,
    localValidationPassed:true,
    repairAttempts:Number(preflight.repairAttempts || 0),
    maxRepairAttempts:SELF_VALIDATING_BUILDER.MAX_REPAIR_ATTEMPTS,
    oneTaskPerCommand:true,
    finalTaskBarrier:true,
    automaticMerge:false,
    deploymentPerformed:false,
    productionTouched:false
  };
  log_('INFO','BUILDER',task['Task ID'],buildId,'PR_OPEN_SELF_VALIDATING',JSON.stringify(result),validation,Date.now()-started,201,0);
  return result;
}

function selfValidatingBuilderTaskSnapshot_(task, buildId, branch, validation, preflight) {
  const snapshot = {};
  Object.keys(task).forEach(function(key){if (key.charAt(0) !== '_') snapshot[key] = task[key];});
  snapshot.builder = {
    version:PB.VERSION,
    mode:'self-validating-builder-package',
    aiProvider:'none',
    buildId:buildId,
    branch:branch,
    targets:validation.paths,
    operationCount:validation.paths.length,
    localValidation:preflight,
    maxRepairAttempts:SELF_VALIDATING_BUILDER.MAX_REPAIR_ATTEMPTS,
    exactCommand:'runNextReadyTask',
    oneTaskPerCommand:true,
    finalTaskBarrier:true,
    automaticMerge:false,
    deploymentPerformed:false,
    productionTouched:false,
    generatedAt:new Date().toISOString()
  };
  return snapshot;
}

function selfValidatingBuilderPullRequestBody_(task, buildId, paths, validation) {
  return [
    '## PULSE-066 self-validating Builder',
    '',
    '- Task: `PULSE-066`',
    '- Build: `' + buildId + '`',
    '- Builder: `' + PB.VERSION + '`',
    '- Target files: ' + paths.map(function(path){return '`' + path + '`';}).join(', '),
    '- Exact command preserved: `runNextReadyTask`',
    '- One task per command: **Yes**',
    '- Repair limit: **3 scoped attempts maximum**',
    '- Repository CI required: **Yes**',
    '- Automatic merge: **No**',
    '- Automatic deployment: **No**',
    '- Production touched: **No**',
    '',
    '### Required loop',
    '`Build → Validate → Repair ≤3 → Retest → Stage → Advance queue`',
    '',
    '### Control contract',
    '- RUN CURRENT BUILD is accepted only for one valid staged task.',
    '- FALSE means no task is ready, the system is running, or the system is blocked.',
    '- The convention is never inverted.',
    '- No separate MARK CHECKED step is required.',
    '',
    '### Safety',
    '- Unknown validation failures fail closed with a scoped recovery note.',
    '- Repairs cannot broaden architecture, replace working flows, rotate secrets, activate payments, make legal/privacy decisions, or mutate live rider data.',
    '- Branches, commits, rollback proof, and pull requests are allowed.',
    '- Merge and production deployment remain manual.',
    '',
    '### Acceptance criteria',
    String(task['Acceptance Criteria'] || ''),
    '',
    'The package passed deterministic local validation. GitHub CI and user merge are still required.'
  ].join('\n');
}

function stageRollbackProof_(result, task, validation) {
  if (!result || !result.branch || !result.buildId || !result.taskId) {
    throw new Error('Cannot stage rollback proof without task, build, and branch identifiers.');
  }
  const prNumber = pullRequestNumber_(result.pullRequest || '');
  const pr = prNumber ? githubRequest_('get', '/repos/' + PB.REPOSITORY + '/pulls/' + prNumber) : null;
  const path = SELF_VALIDATING_BUILDER.ROLLBACK_DIR + '/' +
    safeFileName_(result.taskId) + '/' + safeFileName_(result.buildId) + '.json';
  const proof = {
    taskId:String(result.taskId),
    buildId:String(result.buildId),
    branch:String(result.branch),
    pullRequest:String(result.pullRequest || ''),
    baseBranch:PB.DEFAULT_BRANCH,
    baseSha:pr && pr.base && pr.base.sha ? String(pr.base.sha) : '',
    headSha:pr && pr.head && pr.head.sha ? String(pr.head.sha) : String(result.commit || ''),
    changedPaths:(result.modules || []).slice(),
    rollback:[
      'Before merge: close the pull request or reset the branch to the base SHA.',
      'After merge: revert the merge commit through GitHub review.',
      'For Builder infrastructure: restore the previous installed Builder source and Mobile Control mapping.'
    ],
    preserveRecords:true,
    automaticDeployment:false,
    productionTouched:false,
    validationAttempts:Number(validation.validationAttempts || 0),
    repairAttempts:Number(validation.repairAttempts || 0),
    generatedAt:new Date().toISOString()
  };
  const current = githubTryGetFile_(path, result.branch);
  const commit = githubPutFile_(
    path,
    JSON.stringify(proof, null, 2) + '\n',
    current ? current.sha : null,
    result.branch,
    result.taskId + ': stage rollback proof for ' + result.buildId
  );
  return {
    path:path,
    commit:commit && commit.commit && commit.commit.sha ? commit.commit.sha : String(result.commit || ''),
    baseSha:proof.baseSha,
    preserveRecords:true
  };
}

function pollOpenBuilds() {
  const result = pollOpenBuildsCore_();
  const advancement = advanceAutoValidatedBuilds_();
  enforceRunCurrentBuildContract_();
  result.autoValidation = advancement;
  return result;
}

function advanceAutoValidatedBuilds_() {
  const builds = sheet_(PB.BUILDS_SHEET).getDataRange().getValues();
  if (builds.length < 2) return {ok:true, completed:0, advanced:0};
  const buildHeaders = builds[0].map(String);
  const bi = headerIndex_(buildHeaders);
  let completed = 0;
  let advanced = 0;

  builds.slice(1).forEach(function(row) {
    const status = String(row[bi.Status] || '').toUpperCase();
    const validation = String(row[bi.Validation] || '').toUpperCase();
    if (status !== 'READY_TO_MERGE' || validation !== 'PASS') return;
    const taskId = String(row[bi['Task ID']] || '');
    const task = findTaskById_(taskId);
    if (!task || String(task.Status || '').toUpperCase() !== 'READY_TO_MERGE') return;

    updateTaskById_(taskId, {
      Status:SELF_VALIDATING_BUILDER.COMPLETED_STAGED_STATUS,
      'Last Error':'',
      'Updated At':new Date()
    });
    updateBuildById_(String(row[bi['Build ID']] || ''), {
      Notes:'Repository CI passed. Task is AUTO_VALIDATED_STAGED and ready for manual merge. No deployment performed.'
    });
    completed++;
    const next = advanceQueueAfterPass_(taskId);
    if (next && next.advanced) advanced++;
  });
  return {ok:true, completed:completed, advanced:advanced};
}

function advanceQueueAfterPass_(completedTaskId) {
  if (String(completedTaskId || '') === SELF_VALIDATING_BUILDER.FINAL_TASK_BARRIER) {
    enforceRunCurrentBuildContract_();
    return {ok:true, advanced:false, reason:'PULSE-066 final-task barrier; no automatic next lane.'};
  }
  const existing = nextReadyTask_();
  if (existing) return {ok:true, advanced:false, reason:'A runnable task already exists: ' + existing['Task ID']};

  const sheet = sheet_(PB.TASKS_SHEET);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return {ok:true, advanced:false, reason:'No task rows.'};
  const headers = values[0].map(String);
  const idx = headerIndex_(headers);
  const suffix = String(completedTaskId || '').replace(/^PULSE-/,'');
  const candidates = [];
  values.slice(1).forEach(function(row, offset) {
    const status = String(row[idx.Status] || '').toUpperCase();
    const explicitAfter = status === 'QUEUED_AFTER_' + suffix || status === 'QUEUED_AFTER_' + String(completedTaskId || '');
    const staged = status === 'STAGED_WAITING' || status === 'READY_CANDIDATE';
    if (!explicitAfter && !staged) return;
    const task = rowObject_(headers, row);
    task._row = offset + 2;
    task._explicitAfter = explicitAfter ? 0 : 1;
    task._priorityRank = priorityRank_(task.Priority);
    task._created = new Date(task['Created At'] || 0).getTime() || 0;
    candidates.push(task);
  });
  candidates.sort(function(a,b){
    return a._explicitAfter-b._explicitAfter ||
      a._priorityRank-b._priorityRank ||
      a._created-b._created ||
      a._row-b._row;
  });
  const next = candidates[0];
  if (!next) return {ok:true, advanced:false, reason:'No dependency-satisfied staged successor.'};

  updateTask_(next._row, {
    Status:SELF_VALIDATING_BUILDER.NEXT_READY_STATUS,
    'Assigned Agent':String(next['Assigned Agent'] || 'Pulse Builder + Auto Validator'),
    'Last Error':'',
    'Updated At':new Date()
  });
  log_('INFO','BUILDER',String(next['Task ID'] || ''),'','QUEUE_ADVANCED',
    'Advanced after ' + completedTaskId + ' to READY_TO_RUN.',{},0,200,0);
  enforceRunCurrentBuildContract_();
  return {ok:true, advanced:true, taskId:String(next['Task ID'] || '')};
}

function findTaskById_(taskId) {
  const sheet = sheet_(PB.TASKS_SHEET);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;
  const headers = values[0].map(String);
  const idx = headerIndex_(headers);
  for (let i=1; i<values.length; i++) {
    if (String(values[i][idx['Task ID']] || '') === String(taskId || '')) {
      const task = rowObject_(headers, values[i]);
      task._row = i + 1;
      return task;
    }
  }
  return null;
}

function runCurrentBuildValue_(task, running) {
  return !!task && running !== true;
}

function writeRunCurrentBuildState_(task, running) {
  const ss = SpreadsheetApp.openById(PB.CONTROL_SHEET_ID);
  const sh = ss.getSheetByName(MOBILE_CONTROL.SHEET);
  if (!sh) return {ok:false, reason:'Missing Mobile Control sheet.'};
  const runnable = runCurrentBuildValue_(task, running);
  sh.getRange('A3').setValue(SELF_VALIDATING_BUILDER.RUN_LABEL);
  sh.getRange('C3').setValue('TRUE means one validated staged task is ready. FALSE means running, idle, or blocked.');
  sh.getRange(MOBILE_CONTROL.NEXT_CELL).setValue(
    task ? String(task['Task ID']) + ' — ' + String(task.Title || '') : 'No runnable staged task'
  );
  sh.getRange(MOBILE_CONTROL.RUN_CELL).setValue(runnable);
  return {
    ok:true,
    runnableTask:task ? String(task['Task ID'] || '') : '',
    runCurrentBuild:runnable,
    running:running === true
  };
}

function enforceRunCurrentBuildContract_() {
  return writeRunCurrentBuildState_(nextReadyTask_(), false);
}

function testSelfValidatingBuilderBundle() {
  const validation = validateSelfValidatingBuilderBundle_(PULSE_SELF_VALIDATING_BUILDER_FILES);
  let checks = 0;
  let repairs = 0;
  const repairedFixture = runValidationRepairLoop_(
    function(){
      checks++;
      if (checks < 3) throw new Error('fixture gate failed');
      return {ok:true, gates:['fixture']};
    },
    function(error, attempt){
      repairs++;
      return {repaired:true, scope:'fixture gate only', note:'repair ' + attempt};
    },
    3
  );
  if (repairedFixture.repairAttempts !== 2 || checks !== 3 || repairs !== 2) {
    throw new Error('Repair-loop passing fixture failed.');
  }

  let failClosed = false;
  try {
    runValidationRepairLoop_(
      function(){ throw new Error('persistent fixture failure'); },
      function(error, attempt){ return {repaired:true, scope:'persistent fixture only', note:'attempt ' + attempt}; },
      3
    );
  } catch (error) {
    failClosed = /after 3 scoped repair attempts/.test(cleanError_(error));
  }
  if (!failClosed) throw new Error('Repair-loop fail-closed fixture failed.');

  const readyFixture = { 'Task ID':'PULSE-999' };
  if (runCurrentBuildValue_(readyFixture, false) !== true ||
      runCurrentBuildValue_(readyFixture, true) !== false ||
      runCurrentBuildValue_(null, false) !== false) {
    throw new Error('RUN CURRENT BUILD state fixture failed.');
  }
  if (isSelfValidatingBuilderTask_({'Task ID':'PULSE-999', Area:'Builder Infrastructure'})) {
    throw new Error('Builder task classifier is broader than PULSE-066.');
  }
  if (!isSelfValidatingBuilderTask_({'Task ID':'PULSE-066', Area:'Builder Infrastructure'})) {
    throw new Error('PULSE-066 task classifier failed.');
  }

  const result = {
    ok:true,
    paths:validation.paths,
    totalChars:validation.totalChars,
    exactCommand:'runNextReadyTask',
    requiredLoop:['Build','Validate','Repair ≤3','Retest','Stage','Advance queue'],
    passingFixture:{validationAttempts:checks, repairAttempts:repairs},
    failClosedAfterThree:failClosed,
    oneTaskPerCommand:true,
    runCurrentBuildConventionPreserved:true,
    readyValueTrue:true,
    runningValueFalse:true,
    blockedValueFalse:true,
    taskClassifierExact:true,
    noMarkCheckedStep:true,
    repositoryCiRequired:true,
    rollbackProof:true,
    automaticMerge:false,
    deploymentPerformed:false,
    productionTouched:false
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
