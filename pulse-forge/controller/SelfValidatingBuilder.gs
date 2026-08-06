/**
 * Pulse Forge Permanent Self-Validating Builder.
 *
 * This file is installed beside Code.gs. It never replaces Code.gs, never
 * merges a pull request, never activates an engine, and never deploys or writes
 * production. One task maps to one stable branch and at most one pull request.
 */
const FORGE_PERMANENT_BUILDER = Object.freeze({
  VERSION: '1.0.0',
  CONTROL_SHEET_ID: '1JuaJpLmdP6JtJK3xQ9KuptZ99auy0VwXJjQVbCwF2e0',
  CONTROLLER_SCRIPT_ID: '11j6IpdCl9LjbjsLPfRQQIUBWn3-QEsZew04YvakE3S2Aiv6PjpqHoeXW',
  REPOSITORY: 'justinhoyvt-ship-it/hoy-driver-os',
  DEFAULT_BRANCH: 'main',
  TASKS_SHEET: 'Tasks',
  BUILDS_SHEET: 'Builds',
  LOGS_SHEET: 'Logs',
  BUILDER_FILE_NAME: 'SelfValidatingBuilder',
  INSTALL_STATE_KEY: 'PULSE_FORGE_PERMANENT_BUILDER_INSTALL_V1',
  TASK_STATE_PREFIX: 'PULSE_FORGE_TASK_STATE_V1_',
  MAX_REPAIR_ATTEMPTS: 3,
  READY_STATUSES: Object.freeze(['READY', 'READY_TO_RUN']),
  WAITING_PHONE_STATUS: 'STAGED_WAITING_PHONE_TEST',
  TASK_PACKAGE_ROOT: 'pulse-forge/tasks',
  ALLOWED_CHECK_CONCLUSIONS: Object.freeze(['success', 'neutral', 'skipped']),
  MAX_REPOSITORY_FILES: 100,
  MAX_STAGING_PROJECTS: 10
});

/** Stable permanent entry point. */
function runNextReadyTask() {
  const lock = LockService.getScriptLock();
  forgeAssert_(lock.tryLock(30000), 'Another permanent Builder run is active.');
  try {
    const installation = forgePermanentBuilderInstallationStatus();
    forgeAssert_(installation.verified === true, 'Permanent Builder installation is not VERIFIED.');

    const selfTest = forgePermanentBuilderSelfTest({ quick: true });
    forgeAssert_(selfTest.ok === true, 'Permanent Builder self-test failed closed.');

    const task = forgeBuilderNextActionableTask_();
    if (!task) {
      return forgeBuilderResult_(true, {
        skipped: true,
        stage: 'IDLE',
        reason: 'No READY or READY_TO_RUN task is available.',
        writesPerformed: false
      });
    }
    return forgeBuilderAdvanceTask_(task);
  } finally {
    lock.releaseLock();
  }
}

/** Read-only health and dependency test used by the installer and operators. */
function forgePermanentBuilderSelfTest(options) {
  options = options || {};
  const started = Date.now();
  const problems = [];
  const dependencies = [
    'forgeAssert_',
    'forgeString_',
    'forgeSha256_',
    'forgeStableJson_',
    'forgeCanonicalFiles_',
    'forgeFileInventory_',
    'forgePackageHash_',
    'forgeControllerStatus',
    'forgeControllerSelfTest',
    'forgeGitHubConnectionTest',
    'forgeGitHubApi_',
    'forgeGitHubCreatePullRequest',
    'forgeGetScriptContent',
    'forgeApplyProjectBuild',
    'forgeListRegisteredProjects'
  ];
  const scope = typeof globalThis !== 'undefined' ? globalThis : this;
  const dependencyReport = dependencies.map(function(name) {
    const present = typeof scope[name] === 'function';
    if (!present) problems.push('Missing installed dependency: ' + name);
    return { name: name, present: present };
  });

  let controller = null;
  let github = null;
  let control = null;
  let source = null;
  let fixture = null;
  let installation = null;

  try {
    controller = forgeControllerSelfTest();
    if (!controller || controller.ok !== true) problems.push('forgeControllerSelfTest did not pass.');
  } catch (error) {
    problems.push('Controller self-test error: ' + forgeBuilderCleanError_(error));
  }

  try {
    github = forgeGitHubConnectionTest();
    if (!github || github.ok !== true || github.repository !== FORGE_PERMANENT_BUILDER.REPOSITORY) {
      problems.push('GitHub connection did not resolve the locked repository.');
    }
  } catch (error) {
    problems.push('GitHub connection error: ' + forgeBuilderCleanError_(error));
  }

  try {
    control = forgeBuilderControlSheetProbe_();
    if (!control.ok) problems = problems.concat(control.problems || []);
  } catch (error) {
    problems.push('Control sheet probe error: ' + forgeBuilderCleanError_(error));
  }

  try {
    source = forgeBuilderInstalledSourceProbe_();
    if (!source.ok) problems = problems.concat(source.problems || []);
  } catch (error) {
    problems.push('Installed source probe error: ' + forgeBuilderCleanError_(error));
  }

  try {
    fixture = forgeBuilderDeterministicSelfTest_();
    if (!fixture.ok) problems = problems.concat(fixture.problems || []);
  } catch (error) {
    problems.push('Deterministic fixture error: ' + forgeBuilderCleanError_(error));
  }

  try {
    installation = forgePermanentBuilderInstallationStatus();
    if (!options.installationProbe && installation.verified !== true) {
      problems.push('Installation state is not VERIFIED.');
    }
    if (options.installationProbe && installation.status !== 'VERIFYING' && installation.status !== 'VERIFIED') {
      problems.push('Installation probe requires VERIFYING or VERIFIED state.');
    }
  } catch (error) {
    problems.push('Installation-state error: ' + forgeBuilderCleanError_(error));
  }

  return forgeBuilderResult_(problems.length === 0, {
    builderVersion: FORGE_PERMANENT_BUILDER.VERSION,
    problems: problems,
    dependencies: dependencyReport,
    controller: controller,
    github: github,
    controlSheet: control,
    installedSource: source,
    fixture: fixture,
    installation: installation,
    durationMs: Date.now() - started,
    automaticMerge: false,
    automaticProductionDeployment: false,
    engineActivationPerformed: false,
    productionTouched: false,
    writesPerformed: false
  });
}

function forgePermanentBuilderInstallationStatus() {
  const raw = PropertiesService.getScriptProperties().getProperty(
    FORGE_PERMANENT_BUILDER.INSTALL_STATE_KEY
  );
  let state = {};
  if (raw) {
    try { state = JSON.parse(raw); } catch (error) { state = { status: 'INVALID', error: error.message }; }
  }
  return forgeBuilderResult_(state.status === 'VERIFIED', {
    verified: state.status === 'VERIFIED',
    status: state.status || 'NOT_INSTALLED',
    sourceSha256: forgeString_(state.sourceSha256),
    mergeCommitSha: forgeString_(state.mergeCommitSha),
    rollbackVersion: state.rollbackVersion || null,
    installedAt: forgeString_(state.installedAt),
    lastVerifiedAt: forgeString_(state.lastVerifiedAt),
    automaticMerge: false,
    automaticProductionDeployment: false,
    productionTouched: false,
    writesPerformed: false
  });
}

function forgeBuilderAdvanceTask_(task) {
  const taskId = forgeString_(task['Task ID']).trim();
  forgeAssert_(taskId, 'Task ID is required.');
  const state = forgeBuilderReadTaskState_(taskId);

  if (!state.stage || state.stage === 'READY') {
    return forgeBuilderPreparePullRequest_(task);
  }
  if (state.stage === 'PR_OPEN' || state.stage === 'CI_WAITING' || state.stage === 'READY_TO_MERGE') {
    return forgeBuilderPollPullRequest_(task, state);
  }
  if (state.stage === 'MERGED') {
    return forgeBuilderStageMergedTask_(task, state);
  }
  if (state.stage === FORGE_PERMANENT_BUILDER.WAITING_PHONE_STATUS) {
    return forgeBuilderResult_(true, {
      taskId: taskId,
      stage: state.stage,
      waitingFor: 'PHONE_TEST',
      staging: state.staging || [],
      automaticMerge: false,
      automaticProductionDeployment: false,
      productionTouched: false,
      writesPerformed: false
    });
  }
  if (state.stage === 'PHONE_APPROVED') {
    return forgeBuilderResult_(true, {
      taskId: taskId,
      stage: 'PHONE_APPROVED',
      waitingFor: 'EXPLICIT_PRODUCTION_APPROVAL',
      automaticMerge: false,
      automaticProductionDeployment: false,
      productionTouched: false,
      writesPerformed: false
    });
  }
  throw new Error('Task is in unsupported Builder state: ' + forgeString_(state.stage));
}

function forgeBuilderPreparePullRequest_(task) {
  const taskId = forgeString_(task['Task ID']).trim();
  const manifest = forgeBuilderLoadTaskManifest_(taskId, FORGE_PERMANENT_BUILDER.DEFAULT_BRANCH);
  forgeBuilderValidateTaskManifest_(task, manifest);

  const existing = forgeBuilderFindTaskPullRequests_(manifest);
  forgeAssert_(existing.length <= 1, 'One-task/one-PR contract violated: multiple pull requests exist.');
  if (existing.length === 1) {
    const pull = existing[0];
    forgeAssert_(pull.merged_at || pull.state === 'open', 'The task PR was closed without merge; a second PR is forbidden.');
    const resumed = {
      taskId: taskId,
      stage: pull.merged_at ? 'MERGED' : 'PR_OPEN',
      branch: manifest.branch,
      pullRequestNumber: pull.number,
      pullRequestUrl: pull.html_url,
      headSha: pull.head && pull.head.sha ? pull.head.sha : '',
      mergeCommitSha: pull.merge_commit_sha || '',
      manifestHash: forgeSha256_(forgeStableJson_(manifest)),
      updatedAt: new Date().toISOString()
    };
    forgeBuilderWriteTaskState_(taskId, resumed);
    return forgeBuilderAdvanceTask_(task);
  }

  const files = manifest.repositoryChanges.map(function(change) {
    const content = forgeBuilderReadRepoText_(change.sourcePath, manifest.baseBranch);
    const actual = forgeSha256_(content);
    forgeAssert_(actual === change.sha256, 'Candidate source hash mismatch for ' + change.sourcePath + '.');
    return { path: change.targetPath, content: content };
  });

  const pull = forgeGitHubCreatePullRequest({
    baseBranch: manifest.baseBranch,
    headBranch: manifest.branch,
    title: manifest.pullRequest.title,
    commitMessage: manifest.pullRequest.commitMessage,
    body: forgeBuilderPullRequestBody_(task, manifest),
    files: files,
    draft: false
  });

  const state = {
    taskId: taskId,
    stage: 'PR_OPEN',
    branch: manifest.branch,
    pullRequestNumber: pull.pullRequest.number,
    pullRequestUrl: pull.pullRequest.url,
    headSha: pull.commitSha,
    manifestHash: forgeSha256_(forgeStableJson_(manifest)),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    automaticMerge: false,
    productionTouched: false
  };
  forgeBuilderWriteTaskState_(taskId, state);
  forgeBuilderRecordBuild_(task, state, 'PR_OPEN', 'LOCAL_PASS_PENDING_CI');
  forgeBuilderUpdateTask_(task._row, {
    Status: 'PR_OPEN',
    'Assigned Agent': 'Pulse Forge Permanent Builder',
    'Branch / Build': manifest.branch,
    'Result URL': pull.pullRequest.url,
    'Last Error': '',
    'Updated At': new Date()
  });
  forgeBuilderLog_('INFO', taskId, 'PR_OPEN', 'Created the single task pull request.', state);
  return forgeBuilderResult_(true, Object.assign({}, state, {
    oneTaskOnePullRequest: true,
    automaticMerge: false,
    automaticProductionDeployment: false,
    productionTouched: false,
    writesPerformed: true
  }));
}

function forgeBuilderPollPullRequest_(task, state) {
  const taskId = forgeString_(task['Task ID']);
  const pull = forgeGitHubApi_('/pulls/' + encodeURIComponent(state.pullRequestNumber), { method: 'get' });
  const checks = forgeBuilderCheckRuns_(pull.head.sha);
  const required = forgeBuilderRequiredChecks_(taskId);
  const checkSummary = forgeBuilderEvaluateChecks_(checks, required);

  if (pull.merged_at) {
    forgeAssert_(checkSummary.ok === true, 'Merged PR does not have the required passing CI receipt.');
    state.stage = 'MERGED';
    state.mergeCommitSha = pull.merge_commit_sha;
    state.headSha = pull.head.sha;
    state.checks = checkSummary;
    state.updatedAt = new Date().toISOString();
    forgeBuilderWriteTaskState_(taskId, state);
    forgeBuilderUpdateTask_(task._row, {
      Status: 'MERGED_PENDING_STAGING',
      'Last Error': '',
      'Updated At': new Date()
    });
    forgeBuilderLog_('INFO', taskId, 'MERGED', 'Manual merge verified; isolated staging may begin.', state);
    return forgeBuilderStageMergedTask_(task, state);
  }

  forgeAssert_(pull.state === 'open', 'Task PR is closed without merge; a replacement PR is forbidden.');
  state.stage = checkSummary.ok ? 'READY_TO_MERGE' : 'CI_WAITING';
  state.headSha = pull.head.sha;
  state.checks = checkSummary;
  state.updatedAt = new Date().toISOString();
  forgeBuilderWriteTaskState_(taskId, state);
  forgeBuilderUpdateTask_(task._row, {
    Status: state.stage,
    'Last Error': checkSummary.failed.length ? checkSummary.failed.join(' | ') : '',
    'Updated At': new Date()
  });
  return forgeBuilderResult_(checkSummary.failed.length === 0, {
    taskId: taskId,
    stage: state.stage,
    pullRequestNumber: state.pullRequestNumber,
    pullRequestUrl: state.pullRequestUrl,
    checks: checkSummary,
    waitingFor: checkSummary.ok ? 'MANUAL_MERGE' : 'CI',
    oneTaskOnePullRequest: true,
    automaticMerge: false,
    automaticProductionDeployment: false,
    productionTouched: false,
    writesPerformed: true
  });
}

function forgeBuilderStageMergedTask_(task, state) {
  const taskId = forgeString_(task['Task ID']);
  const manifest = forgeBuilderLoadTaskManifest_(taskId, state.mergeCommitSha || state.headSha);
  forgeBuilderValidateTaskManifest_(task, manifest);
  forgeAssert_(manifest.stagingProjects.length > 0, 'Task manifest has no isolated staging projects.');

  const results = [];
  manifest.stagingProjects.forEach(function(stage) {
    const project = forgeBuilderRegisteredProject_(stage.projectAlias);
    forgeAssert_(project.environment !== 'PRODUCTION', 'Staging target cannot be PRODUCTION.');
    forgeAssert_(project.allowHeadWrite === true, 'Staging target does not allow HEAD writes: ' + project.alias);
    forgeAssert_(project.allowTestDeployment === true, 'Staging target does not allow test deployments: ' + project.alias);
    forgeAssert_(stage.expectedLivePackageHash, 'expectedLivePackageHash is required for ' + project.alias + '.');

    const files = forgeBuilderReadAppsScriptPackage_(stage.sourceRoot, state.mergeCommitSha || state.headSha);
    const validation = forgeValidatePackage({
      packageId: taskId + '-' + project.alias,
      files: files,
      requiredFunctions: stage.requiredFunctions || []
    });
    forgeAssert_(validation.ok === true, 'Staging package validation failed for ' + project.alias + ': ' + validation.problems.join(' | '));

    const repair = forgeBuilderRunRepairLoop_({
      candidate: { files: files },
      maxAttempts: FORGE_PERMANENT_BUILDER.MAX_REPAIR_ATTEMPTS,
      validate: function(candidate) {
        return forgeValidatePackage({
          packageId: taskId + '-' + project.alias,
          files: candidate.files,
          requiredFunctions: stage.requiredFunctions || []
        });
      },
      repair: function() {
        return null;
      }
    });
    forgeAssert_(repair.ok === true, 'Staging validation failed closed; no deterministic scoped repair handler is registered.');

    const build = forgeApplyProjectBuild({
      taskId: taskId,
      projectAlias: project.alias,
      scriptId: project.scriptId,
      packageId: taskId + '-' + project.alias,
      files: repair.candidate.files,
      requiredFunctions: stage.requiredFunctions || [],
      expectedHeadHash: stage.expectedLivePackageHash,
      versionDescription: taskId + ' isolated staging',
      createTestDeployment: true,
      deploymentDescription: taskId + ' isolated phone test'
    });
    results.push({
      projectAlias: project.alias,
      scriptId: project.scriptId,
      packageHash: validation.packageHash,
      rollbackVersion: build.rollbackVersion,
      version: build.version,
      deployment: build.deployment,
      repairAttempts: repair.attemptCount - 1,
      productionTouched: false
    });
  });

  state.stage = FORGE_PERMANENT_BUILDER.WAITING_PHONE_STATUS;
  state.staging = results;
  state.updatedAt = new Date().toISOString();
  forgeBuilderWriteTaskState_(taskId, state);
  forgeBuilderUpdateTask_(task._row, {
    Status: FORGE_PERMANENT_BUILDER.WAITING_PHONE_STATUS,
    'Result URL': forgeBuilderFirstDeploymentUrl_(results),
    'Last Error': '',
    'Updated At': new Date()
  });
  forgeBuilderRecordBuild_(task, state, FORGE_PERMANENT_BUILDER.WAITING_PHONE_STATUS, 'PASS');
  forgeBuilderLog_('INFO', taskId, 'STAGED', 'Created isolated test deployments; waiting for phone test.', results);
  return forgeBuilderResult_(true, {
    taskId: taskId,
    stage: state.stage,
    staging: results,
    waitingFor: 'PHONE_TEST',
    automaticMerge: false,
    automaticProductionDeployment: false,
    engineActivationPerformed: false,
    productionTouched: false,
    writesPerformed: true
  });
}

/** Records the owner's phone-test decision. It never deploys production. */
function forgeBuilderRecordPhoneTest(request) {
  request = request || {};
  const taskId = forgeString_(request.taskId).trim();
  forgeAssert_(taskId, 'taskId is required.');
  const state = forgeBuilderReadTaskState_(taskId);
  forgeAssert_(state.stage === FORGE_PERMANENT_BUILDER.WAITING_PHONE_STATUS, 'Task is not waiting for a phone test.');
  const task = forgeBuilderFindTaskById_(taskId);
  forgeAssert_(task, 'Task row not found: ' + taskId);

  if (request.approved === true) {
    state.stage = 'PHONE_APPROVED';
    state.phoneTest = {
      approved: true,
      note: forgeString_(request.note),
      recordedAt: new Date().toISOString()
    };
    forgeBuilderWriteTaskState_(taskId, state);
    forgeBuilderUpdateTask_(task._row, {
      Status: 'PHONE_APPROVED_WAITING_PRODUCTION_APPROVAL',
      'Last Error': '',
      'Updated At': new Date()
    });
    forgeBuilderLog_('INFO', taskId, 'PHONE_APPROVED', 'Phone test approved; production remains blocked.', state.phoneTest);
    return forgeBuilderResult_(true, {
      taskId: taskId,
      stage: state.stage,
      waitingFor: 'EXPLICIT_PRODUCTION_APPROVAL',
      automaticProductionDeployment: false,
      productionTouched: false,
      writesPerformed: true
    });
  }

  state.stage = 'PHONE_TEST_FAILED';
  state.phoneTest = {
    approved: false,
    note: forgeString_(request.note || 'Phone test failed.'),
    recordedAt: new Date().toISOString()
  };
  forgeBuilderWriteTaskState_(taskId, state);
  forgeBuilderUpdateTask_(task._row, {
    Status: 'NEEDS_REPAIR',
    'Last Error': state.phoneTest.note,
    'Updated At': new Date()
  });
  forgeBuilderLog_('ERROR', taskId, 'PHONE_TEST_FAILED', state.phoneTest.note, state.phoneTest);
  return forgeBuilderResult_(false, {
    taskId: taskId,
    stage: state.stage,
    recovery: 'Repair the existing task branch and existing pull request only; do not create a second PR.',
    productionTouched: false,
    writesPerformed: true
  });
}

function forgeBuilderLoadTaskManifest_(taskId, ref) {
  const path = FORGE_PERMANENT_BUILDER.TASK_PACKAGE_ROOT + '/' + forgeBuilderSafeTaskId_(taskId) + '/task-package.json';
  let text;
  try {
    text = forgeBuilderReadRepoText_(path, ref || FORGE_PERMANENT_BUILDER.DEFAULT_BRANCH);
  } catch (error) {
    throw new Error('Task package is missing or unreadable at ' + path + ': ' + forgeBuilderCleanError_(error));
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('Task package JSON is invalid: ' + forgeBuilderCleanError_(error));
  }
}

function forgeBuilderValidateTaskManifest_(task, manifest) {
  forgeAssert_(manifest && manifest.schemaVersion === 1, 'Task manifest schemaVersion must be 1.');
  const taskId = forgeString_(task['Task ID']).trim();
  forgeAssert_(manifest.taskId === taskId, 'Task manifest Task ID mismatch.');
  forgeAssert_(manifest.repository === FORGE_PERMANENT_BUILDER.REPOSITORY, 'Task manifest repository mismatch.');
  forgeAssert_(manifest.baseBranch === FORGE_PERMANENT_BUILDER.DEFAULT_BRANCH, 'Task manifest base branch mismatch.');
  forgeAssert_(manifest.branch === 'pulse/' + taskId.toLowerCase(), 'Stable one-task branch must be pulse/' + taskId.toLowerCase() + '.');
  forgeAssert_(manifest.production && manifest.production.automaticMerge === false, 'automaticMerge must be false.');
  forgeAssert_(manifest.production.automaticDeployment === false, 'automaticDeployment must be false.');
  forgeAssert_(manifest.production.activateEngine === false, 'activateEngine must be false.');
  forgeAssert_(manifest.pullRequest && forgeString_(manifest.pullRequest.title), 'Pull request title is required.');
  forgeAssert_(Array.isArray(manifest.repositoryChanges), 'repositoryChanges must be an array.');
  forgeAssert_(manifest.repositoryChanges.length > 0, 'At least one repository change is required.');
  forgeAssert_(manifest.repositoryChanges.length <= FORGE_PERMANENT_BUILDER.MAX_REPOSITORY_FILES, 'Repository change count exceeds Builder limit.');
  forgeAssert_(Array.isArray(manifest.stagingProjects), 'stagingProjects must be an array.');
  forgeAssert_(manifest.stagingProjects.length <= FORGE_PERMANENT_BUILDER.MAX_STAGING_PROJECTS, 'Staging project count exceeds Builder limit.');

  const targets = {};
  manifest.repositoryChanges.forEach(function(change) {
    forgeAssert_(change && forgeString_(change.targetPath) && forgeString_(change.sourcePath), 'Every repository change requires targetPath and sourcePath.');
    forgeAssert_(/^[a-f0-9]{64}$/.test(forgeString_(change.sha256)), 'Every repository change requires a SHA-256.');
    const target = forgeString_(change.targetPath).replace(/^\/+/, '');
    const source = forgeString_(change.sourcePath).replace(/^\/+/, '');
    forgeAssert_(!targets[target], 'Duplicate target path: ' + target);
    forgeAssert_(target.indexOf('..') < 0 && source.indexOf('..') < 0, 'Repository paths cannot contain ..');
    forgeAssert_(target.indexOf('.github/workflows/') !== 0 || manifest.allowWorkflowChanges === true, 'Workflow changes require allowWorkflowChanges=true.');
    targets[target] = true;
  });

  const stageAliases = {};
  manifest.stagingProjects.forEach(function(stage) {
    const alias = forgeString_(stage.projectAlias).trim().toUpperCase();
    forgeAssert_(alias && !stageAliases[alias], 'Every staging project requires one unique projectAlias.');
    forgeAssert_(forgeString_(stage.sourceRoot), 'Every staging project requires sourceRoot.');
    forgeAssert_(stage.createTestDeployment === true, 'Every staging project must create an isolated test deployment.');
    forgeAssert_(stage.activateEngine !== true, 'Staging cannot activate an engine.');
    stageAliases[alias] = true;
  });
  return true;
}

function forgeBuilderFindTaskPullRequests_(manifest) {
  const owner = FORGE_PERMANENT_BUILDER.REPOSITORY.split('/')[0];
  const path = '/pulls?state=all&head=' + encodeURIComponent(owner + ':' + manifest.branch) +
    '&base=' + encodeURIComponent(manifest.baseBranch) + '&per_page=100';
  const pulls = forgeGitHubApi_(path, { method: 'get' }) || [];
  return pulls.filter(function(pull) {
    return pull && pull.head && pull.head.ref === manifest.branch;
  });
}

function forgeBuilderCheckRuns_(sha) {
  const response = forgeGitHubApi_('/commits/' + encodeURIComponent(sha) + '/check-runs?per_page=100', { method: 'get' });
  return response && response.check_runs ? response.check_runs : [];
}

function forgeBuilderRequiredChecks_(taskId) {
  const manifest = forgeBuilderLoadTaskManifest_(taskId, FORGE_PERMANENT_BUILDER.DEFAULT_BRANCH);
  return manifest.ci && Array.isArray(manifest.ci.requiredChecks) ? manifest.ci.requiredChecks.slice() : [];
}

function forgeBuilderEvaluateChecks_(checkRuns, requiredChecks) {
  const byName = {};
  (checkRuns || []).forEach(function(run) { byName[forgeString_(run.name)] = run; });
  const pending = [];
  const failed = [];
  const passed = [];
  (requiredChecks || []).forEach(function(name) {
    const run = byName[name];
    if (!run || run.status !== 'completed') {
      pending.push(name);
      return;
    }
    if (FORGE_PERMANENT_BUILDER.ALLOWED_CHECK_CONCLUSIONS.indexOf(run.conclusion) >= 0) passed.push(name);
    else failed.push(name + ': ' + forgeString_(run.conclusion || 'unknown'));
  });
  return {
    ok: requiredChecks.length > 0 && pending.length === 0 && failed.length === 0,
    required: requiredChecks,
    passed: passed,
    pending: pending,
    failed: failed
  };
}

function forgeBuilderReadAppsScriptPackage_(sourceRoot, ref) {
  const root = forgeString_(sourceRoot).replace(/^\/+|\/+$/g, '');
  const commit = forgeGitHubApi_('/commits/' + encodeURIComponent(ref), { method: 'get' });
  const tree = forgeGitHubApi_('/git/trees/' + encodeURIComponent(commit.commit.tree.sha) + '?recursive=1', { method: 'get' });
  const files = (tree.tree || []).filter(function(item) {
    return item.type === 'blob' && item.path.indexOf(root + '/') === 0 &&
      (/\.gs$/i.test(item.path) || /\.html$/i.test(item.path) || /appsscript\.json$/i.test(item.path));
  }).map(function(item) {
    const content = forgeBuilderReadRepoText_(item.path, ref);
    const base = item.path.split('/').pop();
    if (/appsscript\.json$/i.test(base)) return { name: 'appsscript', type: 'JSON', source: content };
    if (/\.gs$/i.test(base)) return { name: base.replace(/\.gs$/i, ''), type: 'SERVER_JS', source: content };
    return { name: base.replace(/\.html$/i, ''), type: 'HTML', source: content };
  });
  forgeAssert_(files.length > 0, 'No Apps Script files found under ' + root + '.');
  return forgeCanonicalFiles_(files);
}

function forgeBuilderReadRepoText_(path, ref) {
  const clean = forgeString_(path).replace(/^\/+/, '');
  const response = forgeGitHubApi_('/contents/' + clean.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(ref), { method: 'get' });
  forgeAssert_(response && response.type === 'file' && response.content, 'Repository file not found: ' + clean);
  return Utilities.newBlob(Utilities.base64Decode(forgeString_(response.content).replace(/\s/g, ''))).getDataAsString('UTF-8');
}

function forgeBuilderRegisteredProject_(alias) {
  const normalized = forgeString_(alias).trim().toUpperCase();
  const projects = forgeListRegisteredProjects().projects || [];
  const matches = projects.filter(function(project) { return project.alias === normalized; });
  forgeAssert_(matches.length === 1, 'Registered project not found or duplicated: ' + normalized);
  return matches[0];
}

function forgeBuilderControlSheetProbe_() {
  const ss = SpreadsheetApp.openById(FORGE_PERMANENT_BUILDER.CONTROL_SHEET_ID);
  const problems = [];
  const required = {
    Tasks: ['Task ID', 'Status'],
    Builds: ['Build ID', 'Task ID', 'Status'],
    Logs: ['Logged At', 'Level', 'Task ID', 'Stage']
  };
  Object.keys(required).forEach(function(sheetName) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      problems.push('Missing control sheet tab: ' + sheetName);
      return;
    }
    const headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getDisplayValues()[0].map(String);
    required[sheetName].forEach(function(header) {
      if (headers.indexOf(header) < 0) problems.push('Missing ' + sheetName + ' header: ' + header);
    });
  });
  return { ok: problems.length === 0, title: ss.getName(), problems: problems, writesPerformed: false };
}

function forgeBuilderInstalledSourceProbe_() {
  const problems = [];
  forgeAssert_(ScriptApp.getScriptId() === FORGE_PERMANENT_BUILDER.CONTROLLER_SCRIPT_ID, 'Builder is installed in the wrong Apps Script project.');
  const content = forgeGetScriptContent(FORGE_PERMANENT_BUILDER.CONTROLLER_SCRIPT_ID);
  const matches = (content.files || []).filter(function(file) {
    return file.name === FORGE_PERMANENT_BUILDER.BUILDER_FILE_NAME && file.type === 'SERVER_JS';
  });
  if (matches.length !== 1) problems.push('Exactly one SelfValidatingBuilder server file is required.');
  const allFunctions = [];
  (content.files || []).filter(function(file) { return file.type === 'SERVER_JS'; }).forEach(function(file) {
    forgeBuilderExtractFunctionNames_(file.source).forEach(function(name) {
      if (name === 'runNextReadyTask') allFunctions.push(file.name);
    });
  });
  if (allFunctions.length !== 1 || allFunctions[0] !== FORGE_PERMANENT_BUILDER.BUILDER_FILE_NAME) {
    problems.push('runNextReadyTask must exist exactly once in SelfValidatingBuilder.');
  }
  const state = forgePermanentBuilderInstallationStatus();
  const sourceHash = matches.length === 1 ? forgeSha256_(matches[0].source) : '';
  if (state.sourceSha256 && sourceHash !== state.sourceSha256) problems.push('Installed Builder source hash does not match the installation receipt.');
  return {
    ok: problems.length === 0,
    sourceSha256: sourceHash,
    fileCount: (content.files || []).length,
    packageHash: content.packageHash,
    problems: problems,
    writesPerformed: false
  };
}

function forgeBuilderDeterministicSelfTest_() {
  const problems = [];
  let candidate = { value: 0, target: 2 };
  const result = forgeBuilderRunRepairLoop_({
    candidate: candidate,
    maxAttempts: 3,
    validate: function(current) {
      return { ok: current.value === current.target, problems: current.value === current.target ? [] : ['not-ready'] };
    },
    repair: function(current) {
      current.value += 1;
      return current;
    }
  });
  if (!result.ok || result.attemptCount !== 3 || result.candidate.value !== 2) problems.push('Bounded repair passing fixture failed.');

  const failed = forgeBuilderRunRepairLoop_({
    candidate: { value: 0 },
    maxAttempts: 3,
    validate: function() { return { ok: false, problems: ['persistent'] }; },
    repair: function(current) { return current; }
  });
  if (failed.ok || failed.attemptCount !== 3) problems.push('Bounded repair fail-closed fixture failed.');

  const syntheticTask = { 'Task ID': 'PULSE-999' };
  const syntheticManifest = {
    schemaVersion: 1,
    taskId: 'PULSE-999',
    repository: FORGE_PERMANENT_BUILDER.REPOSITORY,
    baseBranch: 'main',
    branch: 'pulse/pulse-999',
    pullRequest: { title: 'Fixture', commitMessage: 'Fixture' },
    repositoryChanges: [{ targetPath: 'fixture.txt', sourcePath: 'candidate/fixture.txt', sha256: new Array(65).join('a') }],
    stagingProjects: [],
    ci: { requiredChecks: ['Fixture'] },
    production: { automaticMerge: false, automaticDeployment: false, activateEngine: false }
  };
  try { forgeBuilderValidateTaskManifest_(syntheticTask, syntheticManifest); } catch (error) { problems.push('Manifest fixture failed: ' + error.message); }
  return { ok: problems.length === 0, problems: problems, repairAttemptsBounded: true, oneTaskOnePullRequest: true };
}

function forgeBuilderRunRepairLoop_(request) {
  request = request || {};
  forgeAssert_(typeof request.validate === 'function', 'Repair loop validate callback is required.');
  forgeAssert_(typeof request.repair === 'function', 'Repair loop repair callback is required.');
  const maxAttempts = Math.max(1, Math.min(FORGE_PERMANENT_BUILDER.MAX_REPAIR_ATTEMPTS, Number(request.maxAttempts || 3)));
  let candidate = JSON.parse(JSON.stringify(request.candidate || {}));
  const attempts = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const validation = request.validate(JSON.parse(JSON.stringify(candidate)), attempt) || { ok: false, problems: ['No validation result.'] };
    attempts.push({ attempt: attempt, ok: validation.ok === true, problems: validation.problems || [] });
    if (validation.ok === true) {
      return { ok: true, candidate: candidate, validation: validation, attempts: attempts, attemptCount: attempts.length };
    }
    if (attempt < maxAttempts) {
      const repaired = request.repair(JSON.parse(JSON.stringify(candidate)), validation, attempt);
      if (repaired === null || repaired === undefined) break;
      candidate = JSON.parse(JSON.stringify(repaired));
    }
  }
  return {
    ok: false,
    candidate: candidate,
    validation: attempts.length ? { ok: false, problems: attempts[attempts.length - 1].problems } : { ok: false, problems: ['No attempts.'] },
    attempts: attempts,
    attemptCount: attempts.length
  };
}

function forgeBuilderNextActionableTask_() {
  const sheet = forgeBuilderSheet_(FORGE_PERMANENT_BUILDER.TASKS_SHEET);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;
  const headers = values[0].map(String);
  const map = forgeBuilderHeaderMap_(headers);
  forgeAssert_(map['Task ID'] !== undefined && map.Status !== undefined, 'Tasks sheet requires Task ID and Status headers.');
  const activeStages = [
    'PR_OPEN',
    'CI_WAITING',
    'READY_TO_MERGE',
    'MERGED',
    FORGE_PERMANENT_BUILDER.WAITING_PHONE_STATUS,
    'PHONE_APPROVED'
  ];
  const candidates = [];
  values.slice(1).forEach(function(row, index) {
    const taskId = forgeString_(row[map['Task ID']]).trim();
    if (!taskId) return;
    const status = forgeString_(row[map.Status]).trim().toUpperCase();
    const state = forgeBuilderReadTaskState_(taskId);
    const active = activeStages.indexOf(forgeString_(state.stage).toUpperCase()) >= 0;
    const ready = FORGE_PERMANENT_BUILDER.READY_STATUSES.indexOf(status) >= 0;
    if (!active && !ready) return;
    const task = forgeBuilderRowObject_(headers, row);
    task._row = index + 2;
    task._activeRank = active ? 0 : 1;
    task._priority = forgeBuilderPriority_(task.Priority);
    task._created = new Date(task['Created At'] || 0).getTime() || 0;
    candidates.push(task);
  });
  candidates.sort(function(a, b) {
    return a._activeRank - b._activeRank || a._priority - b._priority || a._created - b._created || a._row - b._row;
  });
  return candidates[0] || null;
}

function forgeBuilderNextReadyTask_() {
  const sheet = forgeBuilderSheet_(FORGE_PERMANENT_BUILDER.TASKS_SHEET);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;
  const headers = values[0].map(String);
  const map = forgeBuilderHeaderMap_(headers);
  forgeAssert_(map['Task ID'] !== undefined && map.Status !== undefined, 'Tasks sheet requires Task ID and Status headers.');
  const tasks = [];
  values.slice(1).forEach(function(row, index) {
    const status = forgeString_(row[map.Status]).trim().toUpperCase();
    if (FORGE_PERMANENT_BUILDER.READY_STATUSES.indexOf(status) < 0) return;
    const task = forgeBuilderRowObject_(headers, row);
    task._row = index + 2;
    task._priority = forgeBuilderPriority_(task.Priority);
    task._created = new Date(task['Created At'] || 0).getTime() || 0;
    tasks.push(task);
  });
  tasks.sort(function(a, b) { return a._priority - b._priority || a._created - b._created || a._row - b._row; });
  return tasks[0] || null;
}

function forgeBuilderFindTaskById_(taskId) {
  const sheet = forgeBuilderSheet_(FORGE_PERMANENT_BUILDER.TASKS_SHEET);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;
  const headers = values[0].map(String);
  const map = forgeBuilderHeaderMap_(headers);
  for (let i = 1; i < values.length; i += 1) {
    if (forgeString_(values[i][map['Task ID']]) === forgeString_(taskId)) {
      const task = forgeBuilderRowObject_(headers, values[i]);
      task._row = i + 1;
      return task;
    }
  }
  return null;
}

function forgeBuilderSheet_(name) {
  const sheet = SpreadsheetApp.openById(FORGE_PERMANENT_BUILDER.CONTROL_SHEET_ID).getSheetByName(name);
  forgeAssert_(sheet, 'Missing control sheet tab: ' + name);
  return sheet;
}

function forgeBuilderHeaderMap_(headers) {
  const map = {};
  (headers || []).forEach(function(header, index) { map[forgeString_(header).trim()] = index; });
  return map;
}

function forgeBuilderRowObject_(headers, row) {
  const result = {};
  headers.forEach(function(header, index) { result[forgeString_(header)] = row[index]; });
  return result;
}

function forgeBuilderUpdateTask_(rowNumber, fields) {
  const sheet = forgeBuilderSheet_(FORGE_PERMANENT_BUILDER.TASKS_SHEET);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const map = forgeBuilderHeaderMap_(headers);
  Object.keys(fields || {}).forEach(function(header) {
    if (map[header] !== undefined) sheet.getRange(rowNumber, map[header] + 1).setValue(fields[header]);
  });
}

function forgeBuilderRecordBuild_(task, state, status, validation) {
  const sheet = forgeBuilderSheet_(FORGE_PERMANENT_BUILDER.BUILDS_SHEET);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const row = headers.map(function(header) {
    const values = {
      'Build ID': state.buildId || ('BUILD-' + Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMdd-HHmmss')),
      'Task ID': task['Task ID'],
      'Started At': state.createdAt || new Date(),
      'Completed At': status === 'PR_OPEN' ? '' : new Date(),
      Agent: 'Pulse Forge Permanent Builder',
      'Source Commit': state.headSha || state.mergeCommitSha || '',
      Branch: state.branch || '',
      'Pull Request': state.pullRequestUrl || '',
      Validation: validation || '',
      Status: status || state.stage || '',
      'Artifact URL': forgeBuilderFirstDeploymentUrl_(state.staging || []),
      Error: '',
      Notes: 'One task = one PR. No automatic merge, engine activation, production deployment, or production mutation.'
    };
    return values[header] !== undefined ? values[header] : '';
  });
  sheet.appendRow(row);
}

function forgeBuilderLog_(level, taskId, stage, message, context) {
  const sheet = forgeBuilderSheet_(FORGE_PERMANENT_BUILDER.LOGS_SHEET);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const values = {
    'Logged At': new Date(),
    Level: level,
    Agent: 'FORGE_PERMANENT_BUILDER',
    'Task ID': taskId,
    'Build ID': '',
    Stage: stage,
    Message: message,
    'Context JSON': JSON.stringify(context || {}),
    'Duration MS': 0,
    'HTTP Status': '',
    'Retry Count': 0,
    'Run ID': Utilities.getUuid()
  };
  sheet.appendRow(headers.map(function(header) { return values[header] !== undefined ? values[header] : ''; }));
}

function forgeBuilderReadTaskState_(taskId) {
  const raw = PropertiesService.getScriptProperties().getProperty(FORGE_PERMANENT_BUILDER.TASK_STATE_PREFIX + taskId);
  if (!raw) return { taskId: taskId, stage: 'READY' };
  try { return JSON.parse(raw); } catch (error) { throw new Error('Task state is invalid JSON: ' + error.message); }
}

function forgeBuilderWriteTaskState_(taskId, state) {
  const copy = JSON.parse(JSON.stringify(state || {}));
  copy.taskId = taskId;
  copy.updatedAt = new Date().toISOString();
  PropertiesService.getScriptProperties().setProperty(
    FORGE_PERMANENT_BUILDER.TASK_STATE_PREFIX + taskId,
    forgeStableJson_(copy)
  );
  return copy;
}

function forgeBuilderPullRequestBody_(task, manifest) {
  return [
    '## ' + manifest.taskId,
    '',
    forgeString_(task.Title || task['Problem / Request'] || 'Pulse Forge task'),
    '',
    '### Builder contract',
    '- One stable branch: `' + manifest.branch + '`',
    '- One task, one pull request',
    '- Required CI: ' + (manifest.ci.requiredChecks || []).map(function(name) { return '`' + name + '`'; }).join(', '),
    '- Automatic merge: **No**',
    '- Automatic production deployment: **No**',
    '- Automatic engine activation: **No**',
    '- Production data mutation: **No**',
    '',
    '### Acceptance criteria',
    forgeString_(task['Acceptance Criteria'] || task['Problem / Request'] || ''),
    '',
    'After CI passes, the owner merges manually. The Builder then creates isolated test deployments only.'
  ].join('\n');
}

function forgeBuilderFirstDeploymentUrl_(staging) {
  for (let i = 0; i < (staging || []).length; i += 1) {
    const deployment = staging[i].deployment || {};
    const entries = deployment.entryPoints || [];
    for (let j = 0; j < entries.length; j += 1) {
      if (entries[j].webApp && entries[j].webApp.url) return entries[j].webApp.url;
    }
  }
  return '';
}

function forgeBuilderExtractFunctionNames_(source) {
  const names = [];
  const regex = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  let match;
  while ((match = regex.exec(forgeString_(source)))) names.push(match[1]);
  return names;
}

function forgeBuilderPriority_(value) {
  const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const key = forgeString_(value).trim().toUpperCase();
  return rank[key] !== undefined ? rank[key] : 9;
}

function forgeBuilderSafeTaskId_(value) {
  const id = forgeString_(value).trim();
  forgeAssert_(/^PULSE-[A-Z0-9\-]+$/i.test(id), 'Unsafe Task ID: ' + id);
  return id.toUpperCase();
}

function forgeBuilderCleanError_(error) {
  return error && error.message ? String(error.message) : String(error || 'Unknown error');
}

function forgeBuilderResult_(ok, fields) {
  return Object.assign({
    ok: !!ok,
    builderVersion: FORGE_PERMANENT_BUILDER.VERSION,
    checkedAt: new Date().toISOString()
  }, fields || {});
}
