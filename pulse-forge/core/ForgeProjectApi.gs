/** Apps Script REST API adapter with non-production mutation guards. */
const FORGE_SCRIPT_API_BASE_ = 'https://script.googleapis.com/v1';

function forgeApiFetch_(url, options) {
  const request = Object.assign({
    method: 'get',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  }, options || {});
  if (request.payload && typeof request.payload !== 'string') {
    request.contentType = request.contentType || 'application/json';
    request.payload = JSON.stringify(request.payload);
  }
  const response = UrlFetchApp.fetch(url, request);
  const status = response.getResponseCode();
  const text = response.getContentText();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (error) { body = { raw: text }; }
  if (status < 200 || status >= 300) {
    const message = body && body.error && body.error.message ? body.error.message : text;
    throw new Error('Apps Script API ' + status + ': ' + message);
  }
  return body;
}

function forgeCreateScriptProject(spec) {
  spec = spec || {};
  const title = forgeString_(spec.title).trim();
  forgeAssert_(title, 'Project title is required.');
  const payload = { title: title };
  if (spec.parentId) payload.parentId = forgeString_(spec.parentId);
  const project = forgeApiFetch_(FORGE_SCRIPT_API_BASE_ + '/projects', {
    method: 'post',
    payload: payload
  });
  return forgeResult_(true, { project: project, productionTouched: false });
}

function forgeGetScriptContent(scriptId, versionNumber) {
  forgeAssert_(forgeString_(scriptId).trim(), 'scriptId is required.');
  let url = FORGE_SCRIPT_API_BASE_ + '/projects/' + encodeURIComponent(scriptId) + '/content';
  if (versionNumber !== null && versionNumber !== undefined && versionNumber !== '') {
    url += '?versionNumber=' + encodeURIComponent(versionNumber);
  }
  const content = forgeApiFetch_(url, { method: 'get' });
  const files = (content.files || []).map(function(file) {
    return {
      name: file.name,
      type: file.type,
      source: forgeNormalizeText_(file.source || '')
    };
  });
  return forgeResult_(true, {
    scriptId: scriptId,
    files: files,
    inventory: forgeFileInventory_(files),
    packageHash: forgePackageHash_(files),
    writesPerformed: false
  });
}

function forgeRequireHeadWrite_(projectAlias, expectedScriptId) {
  const project = forgeRegistryGetProject_(projectAlias);
  forgeAssert_(project.scriptId === expectedScriptId, 'Registered script ID mismatch.');
  forgeAssert_(project.environment !== 'PRODUCTION', 'Forge does not write production HEAD content.');
  forgeAssert_(project.allowHeadWrite === true, 'HEAD writes are disabled for ' + project.alias + '.');
  return project;
}

function forgeUpdateScriptContent(request) {
  request = request || {};
  const scriptId = forgeString_(request.scriptId).trim();
  const project = forgeRequireHeadWrite_(request.projectAlias, scriptId);
  const validation = forgeValidatePackage({
    packageId: request.packageId,
    files: request.files,
    requiredFunctions: request.requiredFunctions || []
  });
  forgeAssert_(validation.ok, 'Package validation failed: ' + validation.problems.join(' | '));

  const current = forgeGetScriptContent(scriptId);
  if (request.expectedHeadHash) {
    forgeAssert_(current.packageHash === request.expectedHeadHash, 'HEAD changed after review; build aborted.');
  }

  const files = forgeCanonicalFiles_(request.files).map(function(file) {
    return { name: file.name, type: file.type, source: file.source };
  });
  const result = forgeApiFetch_(FORGE_SCRIPT_API_BASE_ + '/projects/' + encodeURIComponent(scriptId) + '/content', {
    method: 'put',
    payload: { files: files }
  });
  return forgeResult_(true, {
    projectAlias: project.alias,
    scriptId: scriptId,
    previousHeadHash: current.packageHash,
    packageHash: validation.packageHash,
    apiResult: { scriptId: result.scriptId || scriptId },
    productionTouched: false
  });
}

function forgeCreateScriptVersion(scriptId, description) {
  forgeAssert_(forgeString_(scriptId).trim(), 'scriptId is required.');
  const result = forgeApiFetch_(FORGE_SCRIPT_API_BASE_ + '/projects/' + encodeURIComponent(scriptId) + '/versions', {
    method: 'post',
    payload: { description: forgeString_(description).slice(0, 200) }
  });
  return forgeResult_(true, { scriptId: scriptId, version: result, productionTouched: false });
}

function forgeListDeployments(scriptId) {
  const result = forgeApiFetch_(FORGE_SCRIPT_API_BASE_ + '/projects/' + encodeURIComponent(scriptId) + '/deployments', { method: 'get' });
  return forgeResult_(true, { scriptId: scriptId, deployments: result.deployments || [], writesPerformed: false });
}

function forgeCreateTestDeployment(request) {
  request = request || {};
  const project = forgeRegistryGetProject_(request.projectAlias);
  forgeAssert_(project.scriptId === forgeString_(request.scriptId), 'Registered script ID mismatch.');
  forgeAssert_(project.environment !== 'PRODUCTION', 'Forge cannot create a production deployment.');
  forgeAssert_(project.allowTestDeployment === true, 'Test deployments are disabled for ' + project.alias + '.');
  const result = forgeApiFetch_(FORGE_SCRIPT_API_BASE_ + '/projects/' + encodeURIComponent(project.scriptId) + '/deployments', {
    method: 'post',
    payload: {
      versionNumber: Number(request.versionNumber),
      manifestFileName: 'appsscript',
      description: forgeString_(request.description || 'Forge test deployment').slice(0, 200)
    }
  });
  return forgeResult_(true, { projectAlias: project.alias, deployment: result, productionTouched: false });
}

function forgeRunScriptFunction(request) {
  request = request || {};
  const scriptId = forgeString_(request.scriptId).trim();
  const functionName = forgeString_(request.functionName).trim();
  forgeAssert_(scriptId && functionName, 'scriptId and functionName are required.');
  forgeAssert_(/^forge|^test|^pulseRun|^hipJointTest/.test(functionName), 'Remote function is not on the Forge test allowlist.');
  const result = forgeApiFetch_(FORGE_SCRIPT_API_BASE_ + '/scripts/' + encodeURIComponent(scriptId) + ':run', {
    method: 'post',
    payload: {
      function: functionName,
      parameters: request.parameters || [],
      devMode: request.devMode !== false
    }
  });
  return forgeResult_(!result.error, {
    scriptId: scriptId,
    functionName: functionName,
    response: result,
    writesPerformedByForge: false
  });
}
