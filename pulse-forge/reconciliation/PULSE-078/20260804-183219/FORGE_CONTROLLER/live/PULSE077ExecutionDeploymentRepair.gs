/**
 * PULSE-077 Execution API deployment-ID repair.
 *
 * Google Apps Script API scripts.run requires the API Executable deployment ID,
 * not the Apps Script project ID. This installer opens a reviewed repair PR and
 * provides a post-merge runtime verifier. It never merges, activates an engine,
 * or touches production.
 */

function forgeCreatePulse077ExecutionDeploymentRepairPullRequest() {
  const projectApiPath = 'pulse-forge/core/ForgeProjectApi.gs';
  const controllerPath = 'pulse-forge/controller/Code.gs';
  const testPath = 'pulse-forge/tests/validate.mjs';

  let projectApi = forgePulse077ExecutionRepairReadRepoText_(projectApiPath, 'main');
  let controller = forgePulse077ExecutionRepairReadRepoText_(controllerPath, 'main');
  let tests = forgePulse077ExecutionRepairReadRepoText_(testPath, 'main');

  const oldRunFunction = [
    'function forgeRunScriptFunction(request) {',
    '  request = request || {};',
    '  const scriptId = forgeString_(request.scriptId).trim();',
    '  const functionName = forgeString_(request.functionName).trim();',
    "  forgeAssert_(scriptId && functionName, 'scriptId and functionName are required.');",
    "  forgeAssert_(/^forge|^test|^pulseRun|^hipJointTest/.test(functionName), 'Remote function is not on the Forge test allowlist.');",
    "  const result = forgeApiFetch_(FORGE_SCRIPT_API_BASE_ + '/scripts/' + encodeURIComponent(scriptId) + ':run', {",
    "    method: 'post',",
    '    payload: {',
    '      function: functionName,',
    '      parameters: request.parameters || [],',
    '      devMode: request.devMode !== false',
    '    }',
    '  });',
    '  return forgeResult_(!result.error, {',
    '    scriptId: scriptId,',
    '    functionName: functionName,',
    '    response: result,',
    '    writesPerformedByForge: false',
    '  });',
    '}'
  ].join('\n');

  const newRunFunction = [
    'function forgeRunScriptFunction(request) {',
    '  request = request || {};',
    '  const deploymentId = forgeString_(request.deploymentId).trim();',
    '  const functionName = forgeString_(request.functionName).trim();',
    "  forgeAssert_(deploymentId && functionName, 'deploymentId and functionName are required.');",
    "  forgeAssert_(/^forge|^test|^pulseRun|^hipJointTest/.test(functionName), 'Remote function is not on the Forge test allowlist.');",
    "  const result = forgeApiFetch_(FORGE_SCRIPT_API_BASE_ + '/scripts/' + encodeURIComponent(deploymentId) + ':run', {",
    "    method: 'post',",
    '    payload: {',
    '      function: functionName,',
    '      parameters: request.parameters || [],',
    '      devMode: request.devMode === true',
    '    }',
    '  });',
    '  return forgeResult_(!result.error, {',
    '    deploymentId: deploymentId,',
    '    functionName: functionName,',
    '    response: result,',
    '    writesPerformedByForge: false',
    '  });',
    '}'
  ].join('\n');

  forgeAssert_(projectApi.indexOf(oldRunFunction) >= 0, 'Expected forgeRunScriptFunction source was not found on main.');
  projectApi = projectApi.replace(oldRunFunction, newRunFunction);

  const oldActivationCall = [
    '  const testResult = forgeRunScriptFunction({',
    '    scriptId: request.scriptId,',
    "    functionName: request.testFunction || 'forgeEngineSelfTest',",
    '    parameters: request.parameters || [],',
    '    devMode: false',
    '  });'
  ].join('\n');

  const newActivationCall = [
    '  const testResult = forgeRunScriptFunction({',
    '    deploymentId: request.deploymentId,',
    "    functionName: request.testFunction || 'forgeEngineSelfTest',",
    '    parameters: request.parameters || [],',
    '    devMode: false',
    '  });'
  ].join('\n');

  forgeAssert_(controller.indexOf(oldActivationCall) >= 0, 'Expected activation execution call was not found on main.');
  controller = controller.replace(oldActivationCall, newActivationCall);

  const testAnchor = [
    "if (!combined.includes(\"'Rollback before ' + forgeString_\")) {",
    "  problems.push('Pre-update immutable rollback version is missing.');",
    '}'
  ].join('\n');

  const executionApiTests = [
    testAnchor,
    '',
    "if (!combined.includes(\"const deploymentId = forgeString_(request.deploymentId).trim();\")) {",
    "  problems.push('Execution API calls must require an API Executable deployment ID.');",
    '}',
    "if (!combined.includes(\"'/scripts/' + encodeURIComponent(deploymentId) + ':run'\")) {",
    "  problems.push('Execution API endpoint is not using the deployment ID.');",
    '}',
    "if (combined.includes(\"'/scripts/' + encodeURIComponent(scriptId) + ':run'\")) {",
    "  problems.push('Execution API must not use an Apps Script project ID as the run path ID.');",
    '}',
    "if (!combined.includes('deploymentId: request.deploymentId')) {",
    "  problems.push('Engine activation is not passing the deployment ID.');",
    '}'
  ].join('\n');

  forgeAssert_(tests.indexOf(testAnchor) >= 0, 'Expected validation test anchor was not found on main.');
  tests = tests.replace(testAnchor, executionApiTests);

  const stamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || 'America/New_York',
    'yyyyMMdd-HHmmss'
  );

  const result = forgeGitHubCreatePullRequest({
    baseBranch: 'main',
    headBranch: 'pulse/pulse-077-execution-deployment-id-' + stamp,
    title: 'PULSE-077: Use API executable deployment ID for runtime tests',
    commitMessage: 'Repair Apps Script Execution API deployment ID handling',
    body: [
      '## PULSE-077 runtime repair',
      '',
      'The Apps Script Execution API run endpoint requires the API Executable deployment ID.',
      'Forge incorrectly passed the Apps Script project ID, producing a 404 before the engine function ran.',
      '',
      '### Repair',
      '- Require `deploymentId` in `forgeRunScriptFunction`.',
      '- Use the deployment ID in the `scripts.run` URL.',
      '- Pass the deployment ID through engine validation/activation.',
      '- Add CI guards that reject project-ID execution calls.',
      '',
      '### Safety',
      '- No automatic merge',
      '- No engine activation',
      '- No production deployment'
    ].join('\n'),
    files: [
      { path: projectApiPath, content: projectApi },
      { path: controllerPath, content: controller },
      { path: testPath, content: tests }
    ]
  });

  console.log(JSON.stringify(result, null, 2));
  return result;
}


/**
 * Run only after the execution-deployment-ID repair PR is merged.
 * This verifier resolves the PULSE-077 API Executable deployment and executes
 * the actual inactive engine without activating it.
 */
function forgeVerifyPulse077InactiveEngineByDeployment() {
  const active = forgeGetActiveEngineSlot_();
  const target = active === 'ENGINE_A' ? 'ENGINE_B' : 'ENGINE_A';
  const project = forgeRegistryGetProject_(target);
  const live = forgeGetScriptContent(project.scriptId);

  forgePulse077AssertControllerExecutionScopes_();

  const deployments = forgeListDeployments(project.scriptId).deployments || [];
  const candidates = deployments.filter(function(deployment) {
    const config = deployment.deploymentConfig || {};
    const description = forgeString_(config.description || deployment.description);
    const entryPoints = deployment.entryPoints || [];
    const hasExecutionApi = entryPoints.some(function(entry) {
      return forgeString_(entry.entryPointType).toUpperCase() === 'EXECUTION_API';
    });
    return !!deployment.deploymentId &&
      description.indexOf('PULSE-077 inactive engine test') >= 0 &&
      (hasExecutionApi || entryPoints.length === 0);
  });

  forgeAssert_(candidates.length > 0, 'No PULSE-077 API Executable test deployment was found.');
  candidates.sort(function(a, b) {
    return forgeString_(a.updateTime || a.createTime).localeCompare(
      forgeString_(b.updateTime || b.createTime)
    );
  });
  const deployment = candidates[candidates.length - 1];

  const result = forgeApiFetch_(
    FORGE_SCRIPT_API_BASE_ + '/scripts/' + encodeURIComponent(deployment.deploymentId) + ':run',
    {
      method: 'post',
      payload: {
        function: 'forgeEngineCoreSelfTest',
        parameters: [],
        devMode: false
      }
    }
  );

  const payload = result && result.response && result.response.result;
  if (result && result.error) {
    const details = result.error.details || [];
    const detail = details.length ? details[0] : {};
    throw new Error(
      'PULSE-077 engine returned an execution error: ' +
      forgeString_(detail.errorMessage || result.error.message || JSON.stringify(result.error))
    );
  }

  forgeAssert_(
    payload && payload.ok === true,
    'PULSE-077 inactive engine runtime test did not return an explicit passing receipt.'
  );

  const identity = {
    taskId: 'PULSE-077',
    projectAlias: target,
    scriptId: project.scriptId,
    deploymentId: deployment.deploymentId,
    packageHash: live.packageHash,
    testFunction: 'forgeEngineCoreSelfTest',
    testResultHash: forgeSha256_(forgeStableJson_(payload))
  };
  const receiptId = forgeSha256_(forgeStableJson_(identity));
  const receipt = Object.assign({}, identity, {
    receiptId: receiptId,
    ok: true,
    testedAt: forgeNowIso_(),
    testResult: payload,
    activeEngineUnchanged: active,
    productionTouched: false
  });

  const props = PropertiesService.getScriptProperties();
  const key = 'PULSE_FORGE_PULSE077_RECEIPT_' + receiptId;
  const existing = props.getProperty(key);
  if (existing) {
    forgeAssert_(existing === forgeStableJson_(receipt), 'Stored PULSE-077 receipt differs from the new receipt.');
  } else {
    props.setProperty(key, forgeStableJson_(receipt));
  }
  props.setProperty('PULSE_FORGE_PULSE077_LATEST_RECEIPT', receiptId);

  console.log(JSON.stringify(receipt, null, 2));
  return receipt;
}


function forgePulse077AssertControllerExecutionScopes_() {
  const controller = forgeGetScriptContent(ScriptApp.getScriptId());
  const manifestFile = (controller.files || []).filter(function(file) {
    return file.name === 'appsscript' && file.type === 'JSON';
  })[0];
  forgeAssert_(manifestFile, 'Controller appsscript.json was not found.');

  const manifest = JSON.parse(manifestFile.source);
  const scopes = manifest.oauthScopes || [];
  const required = [
    'https://www.googleapis.com/auth/script.external_request',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.readonly'
  ];
  const missing = required.filter(function(scope) {
    return scopes.indexOf(scope) < 0;
  });
  forgeAssert_(
    missing.length === 0,
    'Controller appsscript.json is missing required runtime scope(s): ' + missing.join(', ')
  );
}


function forgePulse077ExecutionRepairReadRepoText_(path, ref) {
  const encodedPath = forgeString_(path).split('/').map(encodeURIComponent).join('/');
  const result = forgeGitHubApi_(
    '/contents/' + encodedPath + '?ref=' + encodeURIComponent(ref || 'main'),
    { method: 'get' }
  );
  forgeAssert_(
    result && result.content && result.encoding === 'base64',
    'GitHub file content was not returned for ' + path
  );
  const compact = forgeString_(result.content).replace(/\s/g, '');
  return Utilities.newBlob(Utilities.base64Decode(compact)).getDataAsString('UTF-8');
}
function forgeDiagnosePulse077EngineRuntime() {
  const active = forgeGetActiveEngineSlot_();
  const target = active === 'ENGINE_A' ? 'ENGINE_B' : 'ENGINE_A';
  const project = forgeRegistryGetProject_(target);
  const deployments = forgeListDeployments(project.scriptId).deployments || [];

  const report = {
    activeEngineSlot: active,
    inactiveEngineSlot: target,
    registeredProject: project,
    deployments: deployments.map(function(deployment) {
      const config = deployment.deploymentConfig || {};
      return {
        deploymentId: deployment.deploymentId || '',
        versionNumber: config.versionNumber || '',
        description: config.description || deployment.description || '',
        entryPoints: (deployment.entryPoints || []).map(function(entry) {
          return entry.entryPointType || '';
        })
      };
    }),
    writesPerformed: false,
    productionTouched: false
  };

  console.log(JSON.stringify(report, null, 2));
  return report;
}
