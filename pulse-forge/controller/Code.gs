/**
 * Pulse Forge Controller
 * Stable orchestration layer. Product code is built in registered Engine/Test
 * projects; this controller never overwrites its own executing source.
 */
const PULSE_FORGE = Object.freeze({
  VERSION: '0.1.0-foundation',
  AUTOMATIC_MERGE: false,
  AUTOMATIC_PRODUCTION_DEPLOYMENT: false,
  ENGINE_SLOTS: Object.freeze(['ENGINE_A', 'ENGINE_B'])
});


function forgeBootstrapEngineSlots() {
  const registry = forgeRegistryRead_();
  const results = [];
  PULSE_FORGE.ENGINE_SLOTS.forEach(function(slot) {
    let project = registry.projects[slot];
    if (!project) {
      const created = forgeCreateScriptProject({ title: 'Pulse Forge ' + slot });
      forgeRegisterProject({
        alias: slot,
        scriptId: created.project.scriptId,
        environment: slot,
        allowHeadWrite: true,
        allowTestDeployment: true,
        description: 'Replaceable Pulse Forge engine slot'
      });
      project = forgeRegistryGetProject_(slot);
    }
    const current = forgeGetScriptContent(project.scriptId);
    const templateFiles = forgeEngineTemplateFiles_(slot, '0.1.0-bootstrap');
    const comparison = forgeCompareInventories_(current.files, templateFiles);
    let build = null;
    if (!comparison.match) {
      build = forgeApplyProjectBuild({
        taskId: 'FORGE-BOOTSTRAP-' + slot,
        projectAlias: slot,
        scriptId: project.scriptId,
        packageId: 'forge-bootstrap-' + slot.toLowerCase(),
        files: templateFiles,
        requiredFunctions: ['forgeEngineSelfTest'],
        expectedHeadHash: current.packageHash,
        versionDescription: 'Initial Forge engine slot ' + slot,
        createTestDeployment: true,
        deploymentDescription: 'Forge engine bootstrap ' + slot
      });
    }
    results.push({
      slot: slot,
      scriptId: project.scriptId,
      changed: !comparison.match,
      build: build,
      comparison: comparison
    });
  });
  return forgeResult_(true, {
    activeEngineSlot: forgeGetActiveEngineSlot_(),
    slots: results,
    productionTouched: false
  });
}


function forgeControllerStatus() {
  return forgeResult_(true, {
    controllerVersion: PULSE_FORGE.VERSION,
    coreVersion: FORGE_CORE.VERSION,
    activeEngineSlot: forgeGetActiveEngineSlot_(),
    automaticMerge: PULSE_FORGE.AUTOMATIC_MERGE,
    automaticProductionDeployment: PULSE_FORGE.AUTOMATIC_PRODUCTION_DEPLOYMENT,
    registeredProjects: forgeListRegisteredProjects().projects,
    writesPerformed: false
  });
}

function forgePrepareProjectBuild(request) {
  request = request || {};
  const files = forgeCanonicalFiles_(request.files || []);
  const validation = forgeValidatePackage({
    packageId: request.packageId,
    files: files,
    requiredFunctions: request.requiredFunctions || []
  });
  return forgeResult_(validation.ok, {
    taskId: forgeString_(request.taskId),
    projectAlias: forgeString_(request.projectAlias),
    validation: validation,
    package: validation.ok ? {
      packageId: forgeString_(request.packageId),
      packageHash: validation.packageHash,
      files: files
    } : null,
    writesPerformed: false,
    productionTouched: false
  });
}

function forgeCompareRegisteredProject(request) {
  request = request || {};
  const project = forgeRegistryGetProject_(request.projectAlias);
  const live = forgeGetScriptContent(project.scriptId);
  const comparison = forgeCompareInventories_(live.files, request.files || []);
  return forgeResult_(true, {
    projectAlias: project.alias,
    scriptId: project.scriptId,
    livePackageHash: live.packageHash,
    candidatePackageHash: forgePackageHash_(request.files || []),
    comparison: comparison,
    writesPerformed: false
  });
}

function forgeApplyProjectBuild(request) {
  request = request || {};
  return forgeWithBuildLock_(function() {
    const prepared = forgePrepareProjectBuild(request);
    forgeAssert_(prepared.ok, 'Build package is not valid.');
    const liveBefore = forgeGetScriptContent(request.scriptId);
    if (request.expectedHeadHash) {
      forgeAssert_(liveBefore.packageHash === request.expectedHeadHash, 'HEAD changed after review; build aborted.');
    }
    const rollback = forgeCreateScriptVersion(
      request.scriptId,
      'Rollback before ' + forgeString_(request.taskId || request.packageId || 'Forge build')
    );
    const update = forgeUpdateScriptContent({
      projectAlias: request.projectAlias,
      scriptId: request.scriptId,
      packageId: request.packageId,
      files: prepared.package.files,
      requiredFunctions: request.requiredFunctions || [],
      expectedHeadHash: liveBefore.packageHash
    });
    const version = forgeCreateScriptVersion(request.scriptId, request.versionDescription || request.taskId || request.packageId);
    let deployment = null;
    if (request.createTestDeployment === true) {
      deployment = forgeCreateTestDeployment({
        projectAlias: request.projectAlias,
        scriptId: request.scriptId,
        versionNumber: version.version.versionNumber,
        description: request.deploymentDescription || request.taskId || 'Forge test deployment'
      });
    }
    return forgeResult_(true, {
      taskId: forgeString_(request.taskId),
      projectAlias: forgeString_(request.projectAlias),
      rollbackVersion: rollback.version,
      update: update,
      version: version.version,
      deployment: deployment && deployment.deployment,
      automaticMerge: false,
      productionTouched: false
    });
  });
}

function forgeBuildInactiveEngine(request) {
  request = request || {};
  const active = forgeGetActiveEngineSlot_();
  const target = active === 'ENGINE_A' ? 'ENGINE_B' : 'ENGINE_A';
  forgeAssert_(!request.projectAlias || forgeString_(request.projectAlias).toUpperCase() === target, 'Engine build must target the inactive slot.');
  request.projectAlias = target;
  return forgeApplyProjectBuild(request);
}

function forgeValidateAndActivateEngine(request) {
  request = request || {};
  const target = forgeString_(request.projectAlias).toUpperCase();
  forgeAssert_(PULSE_FORGE.ENGINE_SLOTS.indexOf(target) >= 0, 'A valid engine slot is required.');
  const testResult = forgeRunScriptFunction({
    deploymentId: request.deploymentId,
    functionName: request.testFunction || 'forgeEngineSelfTest',
    parameters: request.parameters || [],
    devMode: false
  });
  const payload = testResult.response && testResult.response.response && testResult.response.response.result;
  forgeAssert_(testResult.ok && payload && payload.ok === true, 'Engine test did not return an explicit passing receipt.');
  const receipt = {
    ok: true,
    slot: target,
    packageHash: forgeString_(request.packageHash),
    testedAt: forgeNowIso_(),
    testResult: payload
  };
  return forgeSetActiveEngineSlot(target, receipt);
}

function forgeControllerSelfTest() {
  const sampleFiles = [
    { name: 'Code', type: 'SERVER_JS', source: 'function forgeSampleTest(){return {ok:true};}' },
    { name: 'appsscript', type: 'JSON', source: '{"timeZone":"America/New_York","runtimeVersion":"V8"}' }
  ];
  const validation = forgeValidatePackage({
    packageId: 'SELF-TEST',
    files: sampleFiles,
    requiredFunctions: ['forgeSampleTest']
  });
  const inventory = forgeFileInventory_(sampleFiles);
  const comparison = forgeCompareInventories_(sampleFiles, sampleFiles);
  return forgeResult_(validation.ok && comparison.match, {
    controllerVersion: PULSE_FORGE.VERSION,
    validation: validation,
    inventory: inventory,
    comparison: comparison,
    writesPerformed: false
  });
}
