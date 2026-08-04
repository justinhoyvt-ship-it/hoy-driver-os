/**
 * ForgeCore — dependency-free helpers shared by Pulse Forge, Hip Joint OS,
 * and future Google Apps Script build systems.
 *
 * All functions are prefixed with forge to avoid Apps Script global collisions.
 */
const FORGE_CORE = Object.freeze({
  VERSION: '1.0.0',
  FILE_TYPES: Object.freeze(['SERVER_JS', 'HTML', 'JSON']),
  ENVIRONMENTS: Object.freeze(['CONTROLLER', 'ENGINE_A', 'ENGINE_B', 'TEST', 'STAGING', 'PRODUCTION']),
  MAX_REPAIR_ATTEMPTS: 3,
  MAX_FILES_PER_PROJECT: 200,
  MAX_SOURCE_BYTES: 45 * 1024 * 1024
});


function forgeWithBuildLock_(callback) {
  const lock = LockService.getScriptLock();
  forgeAssert_(lock.tryLock(30000), 'Another Forge build is already running.');
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function forgeAssert_(condition, message) {
  if (!condition) throw new Error(String(message || 'Forge assertion failed.'));
}

function forgeString_(value) {
  return value === null || value === undefined ? '' : String(value);
}

function forgeNowIso_() {
  return new Date().toISOString();
}

function forgeClone_(value) {
  return JSON.parse(JSON.stringify(value));
}

function forgeNormalizeText_(value) {
  return forgeString_(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function forgeUtf8Bytes_(value) {
  return Utilities.newBlob(forgeNormalizeText_(value)).getBytes().length;
}

function forgeHex_(bytes) {
  return bytes.map(function(byte) {
    const unsigned = byte < 0 ? byte + 256 : byte;
    return ('0' + unsigned.toString(16)).slice(-2);
  }).join('');
}

function forgeSha256_(value) {
  return forgeHex_(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    forgeNormalizeText_(value),
    Utilities.Charset.UTF_8
  ));
}

function forgeStableJson_(value) {
  function sort_(input) {
    if (Array.isArray(input)) return input.map(sort_);
    if (input && Object.prototype.toString.call(input) === '[object Object]') {
      return Object.keys(input).sort().reduce(function(out, key) {
        out[key] = sort_(input[key]);
        return out;
      }, {});
    }
    return input;
  }
  return JSON.stringify(sort_(value));
}

function forgeUuid_() {
  return Utilities.getUuid();
}

function forgeRedact_(value) {
  const text = forgeString_(value);
  if (!text) return '';
  if (text.length <= 8) return '***';
  return text.slice(0, 4) + '…' + text.slice(-4);
}

function forgeCanonicalFiles_(files) {
  forgeAssert_(Array.isArray(files), 'Project files must be an array.');
  const normalized = files.map(function(file) {
    const name = forgeString_(file && file.name).trim();
    const type = forgeString_(file && file.type).trim().toUpperCase();
    const source = forgeNormalizeText_(file && file.source);
    forgeAssert_(name, 'Every project file needs a name.');
    forgeAssert_(FORGE_CORE.FILE_TYPES.indexOf(type) >= 0, 'Unsupported file type for ' + name + ': ' + type);
    return { name: name, type: type, source: source };
  }).sort(function(a, b) {
    return a.name.localeCompare(b.name) || a.type.localeCompare(b.type);
  });

  const seen = {};
  normalized.forEach(function(file) {
    const key = file.name.toLowerCase();
    forgeAssert_(!seen[key], 'Duplicate Apps Script file name: ' + file.name);
    seen[key] = true;
  });
  return normalized;
}

function forgeFileInventory_(files) {
  return forgeCanonicalFiles_(files).map(function(file) {
    return {
      name: file.name,
      type: file.type,
      bytes: forgeUtf8Bytes_(file.source),
      sha256: forgeSha256_(file.source)
    };
  });
}

function forgePackageHash_(files) {
  return forgeSha256_(forgeStableJson_(forgeFileInventory_(files)));
}

function forgeResult_(ok, fields) {
  return Object.assign({
    ok: !!ok,
    forgeVersion: FORGE_CORE.VERSION,
    checkedAt: forgeNowIso_()
  }, fields || {});
}


/** Persistent registry and A/B engine slot controls. */
const FORGE_REGISTRY_KEY_ = 'PULSE_FORGE_PROJECT_REGISTRY_V1';
const FORGE_ACTIVE_ENGINE_KEY_ = 'PULSE_FORGE_ACTIVE_ENGINE_SLOT';

function forgeRegistryProps_() {
  return PropertiesService.getScriptProperties();
}

function forgeRegistryRead_() {
  const raw = forgeRegistryProps_().getProperty(FORGE_REGISTRY_KEY_);
  if (!raw) return { projects: {}, updatedAt: null };
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.projects ? parsed : { projects: {}, updatedAt: null };
  } catch (error) {
    throw new Error('Forge registry is invalid JSON: ' + error.message);
  }
}

function forgeRegistryWrite_(registry) {
  const copy = forgeClone_(registry || { projects: {} });
  copy.updatedAt = forgeNowIso_();
  forgeRegistryProps_().setProperty(FORGE_REGISTRY_KEY_, forgeStableJson_(copy));
  return copy;
}

function forgeRegisterProject(project) {
  project = project || {};
  const alias = forgeString_(project.alias).trim().toUpperCase();
  const scriptId = forgeString_(project.scriptId).trim();
  const environment = forgeString_(project.environment).trim().toUpperCase();
  forgeAssert_(/^[A-Z0-9_\-]+$/.test(alias), 'Project alias is required and must be simple text.');
  forgeAssert_(scriptId, 'scriptId is required.');
  forgeAssert_(FORGE_CORE.ENVIRONMENTS.indexOf(environment) >= 0, 'Unsupported Forge environment.');

  const registry = forgeRegistryRead_();
  registry.projects[alias] = {
    alias: alias,
    scriptId: scriptId,
    environment: environment,
    allowHeadWrite: environment !== 'PRODUCTION' && project.allowHeadWrite === true,
    allowTestDeployment: environment !== 'PRODUCTION' && project.allowTestDeployment === true,
    productionDeploymentId: environment === 'PRODUCTION' ? forgeString_(project.productionDeploymentId) : '',
    description: forgeString_(project.description),
    updatedAt: forgeNowIso_()
  };
  forgeRegistryWrite_(registry);
  return forgeResult_(true, { project: forgeClone_(registry.projects[alias]) });
}

function forgeListRegisteredProjects() {
  const registry = forgeRegistryRead_();
  return forgeResult_(true, {
    activeEngineSlot: forgeGetActiveEngineSlot_(),
    projects: Object.keys(registry.projects).sort().map(function(alias) {
      return forgeClone_(registry.projects[alias]);
    })
  });
}

function forgeRegistryGetProject_(alias) {
  const key = forgeString_(alias).trim().toUpperCase();
  const project = forgeRegistryRead_().projects[key];
  forgeAssert_(project, 'Forge project is not registered: ' + key);
  return forgeClone_(project);
}

function forgeGetActiveEngineSlot_() {
  return forgeRegistryProps_().getProperty(FORGE_ACTIVE_ENGINE_KEY_) || 'ENGINE_A';
}

function forgeSetActiveEngineSlot(slot, validationReceipt) {
  const normalized = forgeString_(slot).trim().toUpperCase();
  forgeAssert_(normalized === 'ENGINE_A' || normalized === 'ENGINE_B', 'Engine slot must be ENGINE_A or ENGINE_B.');
  forgeAssert_(validationReceipt && validationReceipt.ok === true, 'A passing validation receipt is required.');
  forgeAssert_(forgeString_(validationReceipt.slot).toUpperCase() === normalized, 'Validation receipt slot mismatch.');
  forgeRegistryProps_().setProperty(FORGE_ACTIVE_ENGINE_KEY_, normalized);
  return forgeResult_(true, { activeEngineSlot: normalized, automaticDeployment: false });
}


/** Static package validation and deterministic no-write checks. */
const FORGE_SECRET_PATTERNS_ = Object.freeze([
  /BEGIN (?:RSA )?PRIVATE KEY/,
  /AIza[0-9A-Za-z\-_]{30,}/,
  /gh[pousr]_[0-9A-Za-z]{20,}/,
  /sk-[0-9A-Za-z]{20,}/
]);
const FORGE_FORBIDDEN_PRODUCTION_MARKERS_ = Object.freeze([
  'automaticMerge:true',
  'automaticDeployment:true',
  'FORGE_AUTO_PRODUCTION=true'
]);

function forgeExtractFunctionNames_(source) {
  const names = [];
  const regex = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  let match;
  while ((match = regex.exec(forgeNormalizeText_(source)))) names.push(match[1]);
  return names;
}

function forgeValidateManifest_(file, problems) {
  try {
    const manifest = JSON.parse(file.source);
    const scopes = manifest.oauthScopes || [];
    const forbidden = [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://mail.google.com/'
    ];
    forbidden.forEach(function(scope) {
      if (scopes.indexOf(scope) >= 0) problems.push('Forbidden broad OAuth scope: ' + scope);
    });
  } catch (error) {
    problems.push('appsscript manifest is invalid JSON: ' + error.message);
  }
}

function forgeValidatePackage(packageSpec) {
  packageSpec = packageSpec || {};
  const problems = [];
  const warnings = [];
  let files = [];
  try {
    files = forgeCanonicalFiles_(packageSpec.files || []);
  } catch (error) {
    return forgeResult_(false, { problems: [error.message], warnings: [], files: [] });
  }

  if (!files.length) problems.push('Project package contains no files.');
  if (files.length > FORGE_CORE.MAX_FILES_PER_PROJECT) problems.push('Project file count exceeds Forge limit.');
  const totalBytes = files.reduce(function(sum, file) { return sum + forgeUtf8Bytes_(file.source); }, 0);
  if (totalBytes > FORGE_CORE.MAX_SOURCE_BYTES) problems.push('Project source exceeds Forge byte limit.');

  const manifestFiles = files.filter(function(file) { return file.name === 'appsscript' && file.type === 'JSON'; });
  if (manifestFiles.length !== 1) problems.push('Exactly one JSON file named appsscript is required.');
  if (manifestFiles[0]) forgeValidateManifest_(manifestFiles[0], problems);

  const allFunctions = [];
  files.filter(function(file) { return file.type === 'SERVER_JS'; }).forEach(function(file) {
    forgeExtractFunctionNames_(file.source).forEach(function(name) {
      allFunctions.push({ name: name, file: file.name });
    });
  });
  const grouped = {};
  allFunctions.forEach(function(item) {
    grouped[item.name] = grouped[item.name] || [];
    grouped[item.name].push(item.file);
  });
  Object.keys(grouped).forEach(function(name) {
    if (grouped[name].length > 1) problems.push('Duplicate server function ' + name + ' in ' + grouped[name].join(', '));
  });

  files.forEach(function(file) {
    FORGE_SECRET_PATTERNS_.forEach(function(pattern) {
      if (pattern.test(file.source)) problems.push('Possible secret in ' + file.name + ': ' + pattern);
    });
    FORGE_FORBIDDEN_PRODUCTION_MARKERS_.forEach(function(marker) {
      if (file.source.indexOf(marker) >= 0) problems.push('Forbidden automatic production marker in ' + file.name + ': ' + marker);
    });
    if (/\b(eval|new Function)\s*\(/.test(file.source)) warnings.push('Dynamic code execution marker in ' + file.name + '.');
  });

  const requiredFunctions = packageSpec.requiredFunctions || [];
  requiredFunctions.forEach(function(name) {
    if (!grouped[name]) problems.push('Required server function missing: ' + name);
  });

  return forgeResult_(problems.length === 0, {
    packageId: forgeString_(packageSpec.packageId),
    packageHash: forgePackageHash_(files),
    totalBytes: totalBytes,
    fileCount: files.length,
    files: forgeFileInventory_(files),
    problems: problems,
    warnings: warnings,
    writesPerformed: false
  });
}

function forgeCompareInventories_(leftFiles, rightFiles) {
  const left = {};
  const right = {};
  forgeFileInventory_(leftFiles).forEach(function(item) { left[item.name] = item; });
  forgeFileInventory_(rightFiles).forEach(function(item) { right[item.name] = item; });
  const names = Object.keys(Object.assign({}, left, right)).sort();
  const results = names.map(function(name) {
    const a = left[name];
    const b = right[name];
    return {
      name: name,
      status: !a ? 'RIGHT_ONLY' : !b ? 'LEFT_ONLY' : a.sha256 === b.sha256 ? 'MATCH' : 'DIFF',
      left: a || null,
      right: b || null
    };
  });
  return {
    match: results.every(function(item) { return item.status === 'MATCH'; }),
    files: results
  };
}


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


/** GitHub Git-database adapter. Creates branches and PRs; never merges. */
const FORGE_GITHUB_DEFAULT_REPOSITORY_ = 'justinhoyvt-ship-it/hoy-driver-os';

function forgeGitHubProps_() {
  return PropertiesService.getScriptProperties();
}

function forgeGitHubToken_() {
  const props = forgeGitHubProps_();
  const token = props.getProperty('PULSE_FORGE_GITHUB_TOKEN') ||
    props.getProperty('GITHUB_TOKEN') ||
    props.getProperty('PULSE_GITHUB_TOKEN') || '';
  forgeAssert_(token, 'GitHub token is not configured in Script Properties.');
  return token;
}

function forgeGitHubRepository_() {
  return forgeGitHubProps_().getProperty('PULSE_FORGE_GITHUB_REPOSITORY') || FORGE_GITHUB_DEFAULT_REPOSITORY_;
}

function forgeGitHubApi_(path, options) {
  const request = Object.assign({
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + forgeGitHubToken_(),
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Pulse-Forge'
    }
  }, options || {});
  if (request.payload && typeof request.payload !== 'string') {
    request.contentType = 'application/json';
    request.payload = JSON.stringify(request.payload);
  }
  const url = 'https://api.github.com/repos/' + forgeGitHubRepository_() + path;
  const response = UrlFetchApp.fetch(url, request);
  const status = response.getResponseCode();
  const text = response.getContentText();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (error) { body = { raw: text }; }
  if (status < 200 || status >= 300) {
    const message = body && body.message ? body.message : text;
    throw new Error('GitHub API ' + status + ': ' + message);
  }
  return body;
}

function forgeGitHubConnectionTest() {
  const repo = forgeGitHubApi_('', { method: 'get' });
  return forgeResult_(true, {
    repository: repo.full_name,
    defaultBranch: repo.default_branch,
    private: !!repo.private,
    permissions: repo.permissions || {},
    token: forgeRedact_(forgeGitHubToken_()),
    writesPerformed: false
  });
}

function forgeGitHubCreateBlob_(source) {
  return forgeGitHubApi_('/git/blobs', {
    method: 'post',
    payload: { content: forgeNormalizeText_(source), encoding: 'utf-8' }
  }).sha;
}

function forgeGitHubCreatePullRequest(request) {
  request = request || {};
  const baseBranch = forgeString_(request.baseBranch || 'main').trim();
  const headBranch = forgeString_(request.headBranch).trim();
  const title = forgeString_(request.title).trim();
  const files = Array.isArray(request.files) ? request.files : [];
  forgeAssert_(baseBranch && headBranch && title, 'baseBranch, headBranch, and title are required.');
  forgeAssert_(files.length > 0, 'At least one repository file is required.');
  forgeAssert_(headBranch !== baseBranch, 'Forge will not commit directly to the base branch.');

  const baseRef = forgeGitHubApi_('/git/ref/heads/' + baseBranch.split('/').map(encodeURIComponent).join('/'), { method: 'get' });
  const baseCommitSha = baseRef.object.sha;
  const baseCommit = forgeGitHubApi_('/git/commits/' + encodeURIComponent(baseCommitSha), { method: 'get' });
  const seen = {};
  const treeItems = files.map(function(file) {
    const path = forgeString_(file.path).replace(/^\/+/, '');
    forgeAssert_(path, 'Repository file path is required.');
    forgeAssert_(!seen[path], 'Duplicate repository path: ' + path);
    seen[path] = true;
    return {
      path: path,
      mode: '100644',
      type: 'blob',
      sha: forgeGitHubCreateBlob_(file.content)
    };
  });
  const tree = forgeGitHubApi_('/git/trees', {
    method: 'post',
    payload: { base_tree: baseCommit.tree.sha, tree: treeItems }
  });
  const commit = forgeGitHubApi_('/git/commits', {
    method: 'post',
    payload: {
      message: forgeString_(request.commitMessage || title),
      tree: tree.sha,
      parents: [baseCommitSha]
    }
  });
  forgeGitHubApi_('/git/refs', {
    method: 'post',
    payload: { ref: 'refs/heads/' + headBranch, sha: commit.sha }
  });
  const pull = forgeGitHubApi_('/pulls', {
    method: 'post',
    payload: {
      title: title,
      head: headBranch,
      base: baseBranch,
      body: forgeString_(request.body),
      draft: request.draft === true
    }
  });
  return forgeResult_(true, {
    repository: forgeGitHubRepository_(),
    baseBranch: baseBranch,
    headBranch: headBranch,
    commitSha: commit.sha,
    pullRequest: {
      number: pull.number,
      url: pull.html_url,
      state: pull.state,
      draft: !!pull.draft
    },
    filesWritten: treeItems.length,
    automaticMerge: false,
    productionTouched: false
  });
}


/** Built-in bootstrap templates. Later engines can replace these packages. */
function forgeEngineTemplateFiles_(slot, version) {
  const normalizedSlot = forgeString_(slot).toUpperCase();
  const normalizedVersion = forgeString_(version || '0.1.0-bootstrap');
  const engineSource = [
    '/** Replaceable Forge Engine slot. Built by the stable controller. */',
    'const FORGE_ENGINE = Object.freeze({',
    "  SLOT: '" + normalizedSlot + "',",
    "  VERSION: '" + normalizedVersion + "'",
    '});',
    '',
    'function forgeEngineSelfTest() {',
    '  return {',
    '    ok: true,',
    '    slot: FORGE_ENGINE.SLOT,',
    '    version: FORGE_ENGINE.VERSION,',
    '    writesPerformed: false',
    '  };',
    '}'
  ].join('\n');
  const manifest = {
    timeZone: 'America/New_York',
    dependencies: {},
    exceptionLogging: 'STACKDRIVER',
    runtimeVersion: 'V8',
    executionApi: { access: 'MYSELF' },
    oauthScopes: ['https://www.googleapis.com/auth/script.external_request']
  };
  return [
    { name: 'Engine', type: 'SERVER_JS', source: engineSource },
    { name: 'appsscript', type: 'JSON', source: JSON.stringify(manifest, null, 2) }
  ];
}


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
    scriptId: request.scriptId,
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

/** One-time bootstrap-only repository self-archive. Not part of the modular controller source. */
const FORGE_BOOTSTRAP_REPOSITORY_FILES_ = Object.freeze([{"path": ".github/workflows/pulse-forge-ci.yml", "content": "name: Pulse Forge CI\n\non:\n  workflow_dispatch:\n  push:\n    branches: [main]\n    paths:\n      - 'pulse-forge/**'\n      - 'pulse-agent/tasks/PULSE-076.json'\n      - '.github/workflows/pulse-forge-ci.yml'\n  pull_request:\n    paths:\n      - 'pulse-forge/**'\n      - 'pulse-agent/tasks/PULSE-076.json'\n      - '.github/workflows/pulse-forge-ci.yml'\n\npermissions:\n  contents: read\n\njobs:\n  validate-forge:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n      - name: Validate Forge source and safety contract\n        run: npm --prefix pulse-forge run validate\n"}, {"path": "pulse-agent/tasks/PULSE-076.json", "content": "{\n  \"taskId\": \"PULSE-076\",\n  \"title\": \"Create the permanent Pulse Forge controller foundation\",\n  \"status\": \"BOOTSTRAP_PACKAGE_READY\",\n  \"buildType\": \"REAL_CODE_PR_FROM_FORGE_BOOTSTRAP\",\n  \"scope\": [\n    \"pulse-forge/controller\",\n    \"pulse-forge/core\",\n    \"pulse-forge/templates\",\n    \"pulse-forge/tests\",\n    \".github/workflows/pulse-forge-ci.yml\"\n  ],\n  \"acceptance\": {\n    \"oneTimeTwoFileBootstrap\": true,\n    \"completeProjectCreateReadWrite\": true,\n    \"immutablePreUpdateRollbackVersion\": true,\n    \"testDeploymentsOnly\": true,\n    \"remoteAllowlistedTests\": true,\n    \"engineABSlots\": true,\n    \"atomicGitHubTreeCommitBranchPullRequest\": true,\n    \"reusableCore\": true,\n    \"automaticMerge\": false,\n    \"automaticProductionDeployment\": false\n  },\n  \"next\": [\n    \"PULSE-077 Forge Engine and task-package generator\",\n    \"PULSE-078 import and reconcile live Pulse projects\",\n    \"PULSE-079 mid-ride request hold product build\",\n    \"PULSE-080 Phase 2A installation and controlled ride\"\n  ]\n}\n"}, {"path": "pulse-forge/OPEN_SOURCE_REVIEW.md", "content": "# Open-source and current-tool review\n\n## Adopted patterns\n\n### google/clasp\n\nUseful patterns: complete-project pull/push, local source control, deployment version management, and remote function execution. Forge does not depend on clasp at runtime because the requirement is to build from inside Apps Script. No clasp source is copied.\n\n### Google Workspace CLI\n\nUseful pattern: discovery-driven Workspace API commands and a script push operation that replaces complete Apps Script project content. Forge keeps its API layer small and explicit instead of adding a CLI runtime dependency.\n\n### Google Workspace Apps Script samples\n\nUseful patterns: official manifest, trigger, API, and error-handling conventions. Product-specific samples should be adopted only through the Code Depo license and security gate.\n\n## Possible later additions\n\n- Generate a standard `.clasp.json` and local package for emergency recovery.\n- Add a GitHub Actions job that uses clasp only for independent CI verification.\n- Add a signed artifact manifest compatible with SLSA provenance.\n- Add OSV dependency scanning for projects that introduce npm dependencies.\n- Add an OpenSSF Scorecard gate before adopting third-party repositories.\n\n## Obsolescence rule\n\nDirect REST calls are isolated in `ForgeProjectApi.gs`. If Google changes an endpoint or introduces a stronger official client, only that adapter should need replacement; package assembly, hashing, validation, registry, and A/B engine logic remain stable.\n"}, {"path": "pulse-forge/README.md", "content": "# Pulse Forge\n\nPulse Forge is the permanent Google Apps Script build controller for Pulse Vermont and a reusable foundation for Hip Joint OS and future projects.\n\n## Architecture\n\n- **Stable Controller:** owns authorization, project registry, mutation guards, versioning, test deployments, validation receipts, and rollback metadata.\n- **Engine A / Engine B:** replaceable build engines. The active engine always builds the inactive slot; the active pointer changes only after an explicit passing test receipt.\n- **Target projects:** request app, Hoy Driver, rider status, Hip Joint OS tools, or future Apps Script products.\n- **Production gate:** Forge can prepare and test release versions, but it does not automatically merge GitHub pull requests or update production deployments.\n\n## What this foundation can do\n\n- Create complete Apps Script projects.\n- Read all `.gs`, `.html`, and manifest content.\n- Validate a complete package before mutation.\n- Replace a registered non-production project's complete HEAD content atomically.\n- Create immutable versions.\n- Create test deployments for registered non-production targets.\n- Run allowlisted test functions through the Apps Script Execution API.\n- Compare complete file inventories by SHA-256.\n- Build and validate the inactive engine slot.\n- Create one atomic GitHub tree, commit, branch, and pull request without merging.\n\n`projects.updateContent` replaces every file in a project. Forge therefore performs a full read, expected-HEAD hash check, complete-package validation, and one atomic update. Files omitted from a package are intentionally removed.\n\n## Bootstrap\n\nThe first installation is a two-file manual bootstrap in a new standalone Apps Script project because the existing Builder does not have `script.projects` and `script.deployments` authorization. The bootstrap creates its own source-control PR and then creates Engine A and Engine B. After that, project creation and complete non-production project builds occur through Forge.\n\n## Safety contract\n\n- No automatic GitHub merge.\n- No automatic production deployment.\n- No production HEAD writes.\n- Registered target and script ID must match.\n- Existing HEAD hash can be required before mutation.\n- Test function names are allowlisted.\n- Secret-like source patterns fail validation.\n- Maximum repair attempts: 3.\n"}, {"path": "pulse-forge/REUSABLE_FUNCTIONS.md", "content": "# Reusable Forge functions\n\nThese functions are deliberately product-neutral and can be reused by Hip Joint OS or future Google Apps Script projects.\n\n## Source integrity\n\n- `forgeSha256_` — deterministic SHA-256 for source, records, and artifacts.\n- `forgeStableJson_` — recursively sorts object keys for repeatable hashes.\n- `forgeCanonicalFiles_` — normalizes and deduplicates complete Apps Script file collections.\n- `forgeFileInventory_` — produces file name, type, byte count, and SHA-256.\n- `forgePackageHash_` — produces one identity for a complete project package.\n- `forgeCompareInventories_` — reports MATCH, DIFF, LEFT_ONLY, or RIGHT_ONLY.\n\n## API and project management\n\n- `forgeApiFetch_` — authenticated JSON adapter for Google APIs.\n- `forgeCreateScriptProject` — creates standalone or bound Apps Script projects.\n- `forgeGetScriptContent` — retrieves complete HEAD or immutable-version source.\n- `forgeUpdateScriptContent` — atomically replaces a registered non-production project after validation and drift checks.\n- `forgeCreateScriptVersion` — creates an immutable release snapshot.\n- `forgeCreateTestDeployment` — creates a registered non-production deployment.\n- `forgeRunScriptFunction` — runs allowlisted test functions remotely.\n- `forgeGitHubCreatePullRequest` — creates blobs, a tree, a commit, a branch, and a pull request atomically without merging.\n\n## Governance\n\n- `forgeRegisterProject` — stores project identity, environment, and allowed mutations.\n- `forgeValidatePackage` — checks manifests, duplicate functions, secrets, scopes, required functions, and automatic-production markers.\n- `forgeBuildInactiveEngine` — always targets the inactive A/B slot.\n- `forgeSetActiveEngineSlot` — switches slots only with an explicit passing validation receipt.\n\nThe reusable core contains no Pulse fare, driver, rider, music, venue, or education-specific business logic.\n"}, {"path": "pulse-forge/WEEKEND_BUILD_SEQUENCE.md", "content": "# Pulse weekend build sequence\n\n## PULSE-076 — Permanent Forge controller\n\nBootstrap the stable controller once, create its source-control PR, merge after CI, then create Engine A and Engine B automatically.\n\n## PULSE-077 — Forge Engine and package generator\n\nAdd task-package assembly, Drive/Sheet artifact adapters, deterministic fixtures, maximum-three repair loop, test receipt storage, and reusable project templates.\n\n## PULSE-078 — Import and reconcile Pulse projects\n\nRead the complete live source for the request app, Hoy Driver, and rider-status components. Compare every file with GitHub, preserve live-only work, repair drift through PRs, and establish one canonical source.\n\n## PULSE-079 — Mid-ride request hold\n\nCreate the first product PR: hold newly observed requests while a ride is active and surface them in Inbox after drop-off without interrupting navigation or creating another request writer.\n\n## PULSE-080 — Phase 2A installation and controlled ride\n\nBuild complete release candidates, create rollback versions and isolated deployments, run the full phone flow, repair failures, and prepare the owner-controlled production release.\n\n## Definition of fully working\n\n- Request form calculates a truthful Pulse fare.\n- One confirmation creates one request.\n- Driver can accept or decline safely.\n- Confirmed rides appear in Scheduled.\n- Ride ID and PIN expose only the correct rider-safe record.\n- Pickup statuses follow the approved foreground sequence.\n- New requests received during a ride wait for safe review.\n- Start Ride and Complete Ride remain intentional.\n- One completed ride creates one Trip Log row.\n- End Shift reconciles earnings.\n- Rollback versions and source hashes are recorded.\n- No automatic GitHub merge or production deployment occurs.\n"}, {"path": "pulse-forge/appsscript.json", "content": "{\n  \"timeZone\": \"America/New_York\",\n  \"dependencies\": {},\n  \"exceptionLogging\": \"STACKDRIVER\",\n  \"runtimeVersion\": \"V8\",\n  \"oauthScopes\": [\n    \"https://www.googleapis.com/auth/script.projects\",\n    \"https://www.googleapis.com/auth/script.deployments\",\n    \"https://www.googleapis.com/auth/script.external_request\",\n    \"https://www.googleapis.com/auth/spreadsheets\"\n  ]\n}\n"}, {"path": "pulse-forge/controller/Code.gs", "content": "/**\n * Pulse Forge Controller\n * Stable orchestration layer. Product code is built in registered Engine/Test\n * projects; this controller never overwrites its own executing source.\n */\nconst PULSE_FORGE = Object.freeze({\n  VERSION: '0.1.0-foundation',\n  AUTOMATIC_MERGE: false,\n  AUTOMATIC_PRODUCTION_DEPLOYMENT: false,\n  ENGINE_SLOTS: Object.freeze(['ENGINE_A', 'ENGINE_B'])\n});\n\n\nfunction forgeBootstrapEngineSlots() {\n  const registry = forgeRegistryRead_();\n  const results = [];\n  PULSE_FORGE.ENGINE_SLOTS.forEach(function(slot) {\n    let project = registry.projects[slot];\n    if (!project) {\n      const created = forgeCreateScriptProject({ title: 'Pulse Forge ' + slot });\n      forgeRegisterProject({\n        alias: slot,\n        scriptId: created.project.scriptId,\n        environment: slot,\n        allowHeadWrite: true,\n        allowTestDeployment: true,\n        description: 'Replaceable Pulse Forge engine slot'\n      });\n      project = forgeRegistryGetProject_(slot);\n    }\n    const current = forgeGetScriptContent(project.scriptId);\n    const templateFiles = forgeEngineTemplateFiles_(slot, '0.1.0-bootstrap');\n    const comparison = forgeCompareInventories_(current.files, templateFiles);\n    let build = null;\n    if (!comparison.match) {\n      build = forgeApplyProjectBuild({\n        taskId: 'FORGE-BOOTSTRAP-' + slot,\n        projectAlias: slot,\n        scriptId: project.scriptId,\n        packageId: 'forge-bootstrap-' + slot.toLowerCase(),\n        files: templateFiles,\n        requiredFunctions: ['forgeEngineSelfTest'],\n        expectedHeadHash: current.packageHash,\n        versionDescription: 'Initial Forge engine slot ' + slot,\n        createTestDeployment: true,\n        deploymentDescription: 'Forge engine bootstrap ' + slot\n      });\n    }\n    results.push({\n      slot: slot,\n      scriptId: project.scriptId,\n      changed: !comparison.match,\n      build: build,\n      comparison: comparison\n    });\n  });\n  return forgeResult_(true, {\n    activeEngineSlot: forgeGetActiveEngineSlot_(),\n    slots: results,\n    productionTouched: false\n  });\n}\n\n\nfunction forgeControllerStatus() {\n  return forgeResult_(true, {\n    controllerVersion: PULSE_FORGE.VERSION,\n    coreVersion: FORGE_CORE.VERSION,\n    activeEngineSlot: forgeGetActiveEngineSlot_(),\n    automaticMerge: PULSE_FORGE.AUTOMATIC_MERGE,\n    automaticProductionDeployment: PULSE_FORGE.AUTOMATIC_PRODUCTION_DEPLOYMENT,\n    registeredProjects: forgeListRegisteredProjects().projects,\n    writesPerformed: false\n  });\n}\n\nfunction forgePrepareProjectBuild(request) {\n  request = request || {};\n  const files = forgeCanonicalFiles_(request.files || []);\n  const validation = forgeValidatePackage({\n    packageId: request.packageId,\n    files: files,\n    requiredFunctions: request.requiredFunctions || []\n  });\n  return forgeResult_(validation.ok, {\n    taskId: forgeString_(request.taskId),\n    projectAlias: forgeString_(request.projectAlias),\n    validation: validation,\n    package: validation.ok ? {\n      packageId: forgeString_(request.packageId),\n      packageHash: validation.packageHash,\n      files: files\n    } : null,\n    writesPerformed: false,\n    productionTouched: false\n  });\n}\n\nfunction forgeCompareRegisteredProject(request) {\n  request = request || {};\n  const project = forgeRegistryGetProject_(request.projectAlias);\n  const live = forgeGetScriptContent(project.scriptId);\n  const comparison = forgeCompareInventories_(live.files, request.files || []);\n  return forgeResult_(true, {\n    projectAlias: project.alias,\n    scriptId: project.scriptId,\n    livePackageHash: live.packageHash,\n    candidatePackageHash: forgePackageHash_(request.files || []),\n    comparison: comparison,\n    writesPerformed: false\n  });\n}\n\nfunction forgeApplyProjectBuild(request) {\n  request = request || {};\n  return forgeWithBuildLock_(function() {\n    const prepared = forgePrepareProjectBuild(request);\n    forgeAssert_(prepared.ok, 'Build package is not valid.');\n    const liveBefore = forgeGetScriptContent(request.scriptId);\n    if (request.expectedHeadHash) {\n      forgeAssert_(liveBefore.packageHash === request.expectedHeadHash, 'HEAD changed after review; build aborted.');\n    }\n    const rollback = forgeCreateScriptVersion(\n      request.scriptId,\n      'Rollback before ' + forgeString_(request.taskId || request.packageId || 'Forge build')\n    );\n    const update = forgeUpdateScriptContent({\n      projectAlias: request.projectAlias,\n      scriptId: request.scriptId,\n      packageId: request.packageId,\n      files: prepared.package.files,\n      requiredFunctions: request.requiredFunctions || [],\n      expectedHeadHash: liveBefore.packageHash\n    });\n    const version = forgeCreateScriptVersion(request.scriptId, request.versionDescription || request.taskId || request.packageId);\n    let deployment = null;\n    if (request.createTestDeployment === true) {\n      deployment = forgeCreateTestDeployment({\n        projectAlias: request.projectAlias,\n        scriptId: request.scriptId,\n        versionNumber: version.version.versionNumber,\n        description: request.deploymentDescription || request.taskId || 'Forge test deployment'\n      });\n    }\n    return forgeResult_(true, {\n      taskId: forgeString_(request.taskId),\n      projectAlias: forgeString_(request.projectAlias),\n      rollbackVersion: rollback.version,\n      update: update,\n      version: version.version,\n      deployment: deployment && deployment.deployment,\n      automaticMerge: false,\n      productionTouched: false\n    });\n  });\n}\n\nfunction forgeBuildInactiveEngine(request) {\n  request = request || {};\n  const active = forgeGetActiveEngineSlot_();\n  const target = active === 'ENGINE_A' ? 'ENGINE_B' : 'ENGINE_A';\n  forgeAssert_(!request.projectAlias || forgeString_(request.projectAlias).toUpperCase() === target, 'Engine build must target the inactive slot.');\n  request.projectAlias = target;\n  return forgeApplyProjectBuild(request);\n}\n\nfunction forgeValidateAndActivateEngine(request) {\n  request = request || {};\n  const target = forgeString_(request.projectAlias).toUpperCase();\n  forgeAssert_(PULSE_FORGE.ENGINE_SLOTS.indexOf(target) >= 0, 'A valid engine slot is required.');\n  const testResult = forgeRunScriptFunction({\n    scriptId: request.scriptId,\n    functionName: request.testFunction || 'forgeEngineSelfTest',\n    parameters: request.parameters || [],\n    devMode: false\n  });\n  const payload = testResult.response && testResult.response.response && testResult.response.response.result;\n  forgeAssert_(testResult.ok && payload && payload.ok === true, 'Engine test did not return an explicit passing receipt.');\n  const receipt = {\n    ok: true,\n    slot: target,\n    packageHash: forgeString_(request.packageHash),\n    testedAt: forgeNowIso_(),\n    testResult: payload\n  };\n  return forgeSetActiveEngineSlot(target, receipt);\n}\n\nfunction forgeControllerSelfTest() {\n  const sampleFiles = [\n    { name: 'Code', type: 'SERVER_JS', source: 'function forgeSampleTest(){return {ok:true};}' },\n    { name: 'appsscript', type: 'JSON', source: '{\"timeZone\":\"America/New_York\",\"runtimeVersion\":\"V8\"}' }\n  ];\n  const validation = forgeValidatePackage({\n    packageId: 'SELF-TEST',\n    files: sampleFiles,\n    requiredFunctions: ['forgeSampleTest']\n  });\n  const inventory = forgeFileInventory_(sampleFiles);\n  const comparison = forgeCompareInventories_(sampleFiles, sampleFiles);\n  return forgeResult_(validation.ok && comparison.match, {\n    controllerVersion: PULSE_FORGE.VERSION,\n    validation: validation,\n    inventory: inventory,\n    comparison: comparison,\n    writesPerformed: false\n  });\n}\n"}, {"path": "pulse-forge/controller/ForgeTemplates.gs", "content": "/** Built-in bootstrap templates. Later engines can replace these packages. */\nfunction forgeEngineTemplateFiles_(slot, version) {\n  const normalizedSlot = forgeString_(slot).toUpperCase();\n  const normalizedVersion = forgeString_(version || '0.1.0-bootstrap');\n  const engineSource = [\n    '/** Replaceable Forge Engine slot. Built by the stable controller. */',\n    'const FORGE_ENGINE = Object.freeze({',\n    \"  SLOT: '\" + normalizedSlot + \"',\",\n    \"  VERSION: '\" + normalizedVersion + \"'\",\n    '});',\n    '',\n    'function forgeEngineSelfTest() {',\n    '  return {',\n    '    ok: true,',\n    '    slot: FORGE_ENGINE.SLOT,',\n    '    version: FORGE_ENGINE.VERSION,',\n    '    writesPerformed: false',\n    '  };',\n    '}'\n  ].join('\\n');\n  const manifest = {\n    timeZone: 'America/New_York',\n    dependencies: {},\n    exceptionLogging: 'STACKDRIVER',\n    runtimeVersion: 'V8',\n    executionApi: { access: 'MYSELF' },\n    oauthScopes: ['https://www.googleapis.com/auth/script.external_request']\n  };\n  return [\n    { name: 'Engine', type: 'SERVER_JS', source: engineSource },\n    { name: 'appsscript', type: 'JSON', source: JSON.stringify(manifest, null, 2) }\n  ];\n}\n"}, {"path": "pulse-forge/core/ForgeCore.gs", "content": "/**\n * ForgeCore — dependency-free helpers shared by Pulse Forge, Hip Joint OS,\n * and future Google Apps Script build systems.\n *\n * All functions are prefixed with forge to avoid Apps Script global collisions.\n */\nconst FORGE_CORE = Object.freeze({\n  VERSION: '1.0.0',\n  FILE_TYPES: Object.freeze(['SERVER_JS', 'HTML', 'JSON']),\n  ENVIRONMENTS: Object.freeze(['CONTROLLER', 'ENGINE_A', 'ENGINE_B', 'TEST', 'STAGING', 'PRODUCTION']),\n  MAX_REPAIR_ATTEMPTS: 3,\n  MAX_FILES_PER_PROJECT: 200,\n  MAX_SOURCE_BYTES: 45 * 1024 * 1024\n});\n\n\nfunction forgeWithBuildLock_(callback) {\n  const lock = LockService.getScriptLock();\n  forgeAssert_(lock.tryLock(30000), 'Another Forge build is already running.');\n  try {\n    return callback();\n  } finally {\n    lock.releaseLock();\n  }\n}\n\nfunction forgeAssert_(condition, message) {\n  if (!condition) throw new Error(String(message || 'Forge assertion failed.'));\n}\n\nfunction forgeString_(value) {\n  return value === null || value === undefined ? '' : String(value);\n}\n\nfunction forgeNowIso_() {\n  return new Date().toISOString();\n}\n\nfunction forgeClone_(value) {\n  return JSON.parse(JSON.stringify(value));\n}\n\nfunction forgeNormalizeText_(value) {\n  return forgeString_(value).replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');\n}\n\nfunction forgeUtf8Bytes_(value) {\n  return Utilities.newBlob(forgeNormalizeText_(value)).getBytes().length;\n}\n\nfunction forgeHex_(bytes) {\n  return bytes.map(function(byte) {\n    const unsigned = byte < 0 ? byte + 256 : byte;\n    return ('0' + unsigned.toString(16)).slice(-2);\n  }).join('');\n}\n\nfunction forgeSha256_(value) {\n  return forgeHex_(Utilities.computeDigest(\n    Utilities.DigestAlgorithm.SHA_256,\n    forgeNormalizeText_(value),\n    Utilities.Charset.UTF_8\n  ));\n}\n\nfunction forgeStableJson_(value) {\n  function sort_(input) {\n    if (Array.isArray(input)) return input.map(sort_);\n    if (input && Object.prototype.toString.call(input) === '[object Object]') {\n      return Object.keys(input).sort().reduce(function(out, key) {\n        out[key] = sort_(input[key]);\n        return out;\n      }, {});\n    }\n    return input;\n  }\n  return JSON.stringify(sort_(value));\n}\n\nfunction forgeUuid_() {\n  return Utilities.getUuid();\n}\n\nfunction forgeRedact_(value) {\n  const text = forgeString_(value);\n  if (!text) return '';\n  if (text.length <= 8) return '***';\n  return text.slice(0, 4) + '…' + text.slice(-4);\n}\n\nfunction forgeCanonicalFiles_(files) {\n  forgeAssert_(Array.isArray(files), 'Project files must be an array.');\n  const normalized = files.map(function(file) {\n    const name = forgeString_(file && file.name).trim();\n    const type = forgeString_(file && file.type).trim().toUpperCase();\n    const source = forgeNormalizeText_(file && file.source);\n    forgeAssert_(name, 'Every project file needs a name.');\n    forgeAssert_(FORGE_CORE.FILE_TYPES.indexOf(type) >= 0, 'Unsupported file type for ' + name + ': ' + type);\n    return { name: name, type: type, source: source };\n  }).sort(function(a, b) {\n    return a.name.localeCompare(b.name) || a.type.localeCompare(b.type);\n  });\n\n  const seen = {};\n  normalized.forEach(function(file) {\n    const key = file.name.toLowerCase();\n    forgeAssert_(!seen[key], 'Duplicate Apps Script file name: ' + file.name);\n    seen[key] = true;\n  });\n  return normalized;\n}\n\nfunction forgeFileInventory_(files) {\n  return forgeCanonicalFiles_(files).map(function(file) {\n    return {\n      name: file.name,\n      type: file.type,\n      bytes: forgeUtf8Bytes_(file.source),\n      sha256: forgeSha256_(file.source)\n    };\n  });\n}\n\nfunction forgePackageHash_(files) {\n  return forgeSha256_(forgeStableJson_(forgeFileInventory_(files)));\n}\n\nfunction forgeResult_(ok, fields) {\n  return Object.assign({\n    ok: !!ok,\n    forgeVersion: FORGE_CORE.VERSION,\n    checkedAt: forgeNowIso_()\n  }, fields || {});\n}\n"}, {"path": "pulse-forge/core/ForgeGitHub.gs", "content": "/** GitHub Git-database adapter. Creates branches and PRs; never merges. */\nconst FORGE_GITHUB_DEFAULT_REPOSITORY_ = 'justinhoyvt-ship-it/hoy-driver-os';\n\nfunction forgeGitHubProps_() {\n  return PropertiesService.getScriptProperties();\n}\n\nfunction forgeGitHubToken_() {\n  const props = forgeGitHubProps_();\n  const token = props.getProperty('PULSE_FORGE_GITHUB_TOKEN') ||\n    props.getProperty('GITHUB_TOKEN') ||\n    props.getProperty('PULSE_GITHUB_TOKEN') || '';\n  forgeAssert_(token, 'GitHub token is not configured in Script Properties.');\n  return token;\n}\n\nfunction forgeGitHubRepository_() {\n  return forgeGitHubProps_().getProperty('PULSE_FORGE_GITHUB_REPOSITORY') || FORGE_GITHUB_DEFAULT_REPOSITORY_;\n}\n\nfunction forgeGitHubApi_(path, options) {\n  const request = Object.assign({\n    method: 'get',\n    muteHttpExceptions: true,\n    headers: {\n      Authorization: 'Bearer ' + forgeGitHubToken_(),\n      Accept: 'application/vnd.github+json',\n      'X-GitHub-Api-Version': '2022-11-28',\n      'User-Agent': 'Pulse-Forge'\n    }\n  }, options || {});\n  if (request.payload && typeof request.payload !== 'string') {\n    request.contentType = 'application/json';\n    request.payload = JSON.stringify(request.payload);\n  }\n  const url = 'https://api.github.com/repos/' + forgeGitHubRepository_() + path;\n  const response = UrlFetchApp.fetch(url, request);\n  const status = response.getResponseCode();\n  const text = response.getContentText();\n  let body = {};\n  try { body = text ? JSON.parse(text) : {}; } catch (error) { body = { raw: text }; }\n  if (status < 200 || status >= 300) {\n    const message = body && body.message ? body.message : text;\n    throw new Error('GitHub API ' + status + ': ' + message);\n  }\n  return body;\n}\n\nfunction forgeGitHubConnectionTest() {\n  const repo = forgeGitHubApi_('', { method: 'get' });\n  return forgeResult_(true, {\n    repository: repo.full_name,\n    defaultBranch: repo.default_branch,\n    private: !!repo.private,\n    permissions: repo.permissions || {},\n    token: forgeRedact_(forgeGitHubToken_()),\n    writesPerformed: false\n  });\n}\n\nfunction forgeGitHubCreateBlob_(source) {\n  return forgeGitHubApi_('/git/blobs', {\n    method: 'post',\n    payload: { content: forgeNormalizeText_(source), encoding: 'utf-8' }\n  }).sha;\n}\n\nfunction forgeGitHubCreatePullRequest(request) {\n  request = request || {};\n  const baseBranch = forgeString_(request.baseBranch || 'main').trim();\n  const headBranch = forgeString_(request.headBranch).trim();\n  const title = forgeString_(request.title).trim();\n  const files = Array.isArray(request.files) ? request.files : [];\n  forgeAssert_(baseBranch && headBranch && title, 'baseBranch, headBranch, and title are required.');\n  forgeAssert_(files.length > 0, 'At least one repository file is required.');\n  forgeAssert_(headBranch !== baseBranch, 'Forge will not commit directly to the base branch.');\n\n  const baseRef = forgeGitHubApi_('/git/ref/heads/' + baseBranch.split('/').map(encodeURIComponent).join('/'), { method: 'get' });\n  const baseCommitSha = baseRef.object.sha;\n  const baseCommit = forgeGitHubApi_('/git/commits/' + encodeURIComponent(baseCommitSha), { method: 'get' });\n  const seen = {};\n  const treeItems = files.map(function(file) {\n    const path = forgeString_(file.path).replace(/^\\/+/, '');\n    forgeAssert_(path, 'Repository file path is required.');\n    forgeAssert_(!seen[path], 'Duplicate repository path: ' + path);\n    seen[path] = true;\n    return {\n      path: path,\n      mode: '100644',\n      type: 'blob',\n      sha: forgeGitHubCreateBlob_(file.content)\n    };\n  });\n  const tree = forgeGitHubApi_('/git/trees', {\n    method: 'post',\n    payload: { base_tree: baseCommit.tree.sha, tree: treeItems }\n  });\n  const commit = forgeGitHubApi_('/git/commits', {\n    method: 'post',\n    payload: {\n      message: forgeString_(request.commitMessage || title),\n      tree: tree.sha,\n      parents: [baseCommitSha]\n    }\n  });\n  forgeGitHubApi_('/git/refs', {\n    method: 'post',\n    payload: { ref: 'refs/heads/' + headBranch, sha: commit.sha }\n  });\n  const pull = forgeGitHubApi_('/pulls', {\n    method: 'post',\n    payload: {\n      title: title,\n      head: headBranch,\n      base: baseBranch,\n      body: forgeString_(request.body),\n      draft: request.draft === true\n    }\n  });\n  return forgeResult_(true, {\n    repository: forgeGitHubRepository_(),\n    baseBranch: baseBranch,\n    headBranch: headBranch,\n    commitSha: commit.sha,\n    pullRequest: {\n      number: pull.number,\n      url: pull.html_url,\n      state: pull.state,\n      draft: !!pull.draft\n    },\n    filesWritten: treeItems.length,\n    automaticMerge: false,\n    productionTouched: false\n  });\n}\n"}, {"path": "pulse-forge/core/ForgeProjectApi.gs", "content": "/** Apps Script REST API adapter with non-production mutation guards. */\nconst FORGE_SCRIPT_API_BASE_ = 'https://script.googleapis.com/v1';\n\nfunction forgeApiFetch_(url, options) {\n  const request = Object.assign({\n    method: 'get',\n    muteHttpExceptions: true,\n    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }\n  }, options || {});\n  if (request.payload && typeof request.payload !== 'string') {\n    request.contentType = request.contentType || 'application/json';\n    request.payload = JSON.stringify(request.payload);\n  }\n  const response = UrlFetchApp.fetch(url, request);\n  const status = response.getResponseCode();\n  const text = response.getContentText();\n  let body = {};\n  try { body = text ? JSON.parse(text) : {}; } catch (error) { body = { raw: text }; }\n  if (status < 200 || status >= 300) {\n    const message = body && body.error && body.error.message ? body.error.message : text;\n    throw new Error('Apps Script API ' + status + ': ' + message);\n  }\n  return body;\n}\n\nfunction forgeCreateScriptProject(spec) {\n  spec = spec || {};\n  const title = forgeString_(spec.title).trim();\n  forgeAssert_(title, 'Project title is required.');\n  const payload = { title: title };\n  if (spec.parentId) payload.parentId = forgeString_(spec.parentId);\n  const project = forgeApiFetch_(FORGE_SCRIPT_API_BASE_ + '/projects', {\n    method: 'post',\n    payload: payload\n  });\n  return forgeResult_(true, { project: project, productionTouched: false });\n}\n\nfunction forgeGetScriptContent(scriptId, versionNumber) {\n  forgeAssert_(forgeString_(scriptId).trim(), 'scriptId is required.');\n  let url = FORGE_SCRIPT_API_BASE_ + '/projects/' + encodeURIComponent(scriptId) + '/content';\n  if (versionNumber !== null && versionNumber !== undefined && versionNumber !== '') {\n    url += '?versionNumber=' + encodeURIComponent(versionNumber);\n  }\n  const content = forgeApiFetch_(url, { method: 'get' });\n  const files = (content.files || []).map(function(file) {\n    return {\n      name: file.name,\n      type: file.type,\n      source: forgeNormalizeText_(file.source || '')\n    };\n  });\n  return forgeResult_(true, {\n    scriptId: scriptId,\n    files: files,\n    inventory: forgeFileInventory_(files),\n    packageHash: forgePackageHash_(files),\n    writesPerformed: false\n  });\n}\n\nfunction forgeRequireHeadWrite_(projectAlias, expectedScriptId) {\n  const project = forgeRegistryGetProject_(projectAlias);\n  forgeAssert_(project.scriptId === expectedScriptId, 'Registered script ID mismatch.');\n  forgeAssert_(project.environment !== 'PRODUCTION', 'Forge does not write production HEAD content.');\n  forgeAssert_(project.allowHeadWrite === true, 'HEAD writes are disabled for ' + project.alias + '.');\n  return project;\n}\n\nfunction forgeUpdateScriptContent(request) {\n  request = request || {};\n  const scriptId = forgeString_(request.scriptId).trim();\n  const project = forgeRequireHeadWrite_(request.projectAlias, scriptId);\n  const validation = forgeValidatePackage({\n    packageId: request.packageId,\n    files: request.files,\n    requiredFunctions: request.requiredFunctions || []\n  });\n  forgeAssert_(validation.ok, 'Package validation failed: ' + validation.problems.join(' | '));\n\n  const current = forgeGetScriptContent(scriptId);\n  if (request.expectedHeadHash) {\n    forgeAssert_(current.packageHash === request.expectedHeadHash, 'HEAD changed after review; build aborted.');\n  }\n\n  const files = forgeCanonicalFiles_(request.files).map(function(file) {\n    return { name: file.name, type: file.type, source: file.source };\n  });\n  const result = forgeApiFetch_(FORGE_SCRIPT_API_BASE_ + '/projects/' + encodeURIComponent(scriptId) + '/content', {\n    method: 'put',\n    payload: { files: files }\n  });\n  return forgeResult_(true, {\n    projectAlias: project.alias,\n    scriptId: scriptId,\n    previousHeadHash: current.packageHash,\n    packageHash: validation.packageHash,\n    apiResult: { scriptId: result.scriptId || scriptId },\n    productionTouched: false\n  });\n}\n\nfunction forgeCreateScriptVersion(scriptId, description) {\n  forgeAssert_(forgeString_(scriptId).trim(), 'scriptId is required.');\n  const result = forgeApiFetch_(FORGE_SCRIPT_API_BASE_ + '/projects/' + encodeURIComponent(scriptId) + '/versions', {\n    method: 'post',\n    payload: { description: forgeString_(description).slice(0, 200) }\n  });\n  return forgeResult_(true, { scriptId: scriptId, version: result, productionTouched: false });\n}\n\nfunction forgeListDeployments(scriptId) {\n  const result = forgeApiFetch_(FORGE_SCRIPT_API_BASE_ + '/projects/' + encodeURIComponent(scriptId) + '/deployments', { method: 'get' });\n  return forgeResult_(true, { scriptId: scriptId, deployments: result.deployments || [], writesPerformed: false });\n}\n\nfunction forgeCreateTestDeployment(request) {\n  request = request || {};\n  const project = forgeRegistryGetProject_(request.projectAlias);\n  forgeAssert_(project.scriptId === forgeString_(request.scriptId), 'Registered script ID mismatch.');\n  forgeAssert_(project.environment !== 'PRODUCTION', 'Forge cannot create a production deployment.');\n  forgeAssert_(project.allowTestDeployment === true, 'Test deployments are disabled for ' + project.alias + '.');\n  const result = forgeApiFetch_(FORGE_SCRIPT_API_BASE_ + '/projects/' + encodeURIComponent(project.scriptId) + '/deployments', {\n    method: 'post',\n    payload: {\n      versionNumber: Number(request.versionNumber),\n      manifestFileName: 'appsscript',\n      description: forgeString_(request.description || 'Forge test deployment').slice(0, 200)\n    }\n  });\n  return forgeResult_(true, { projectAlias: project.alias, deployment: result, productionTouched: false });\n}\n\nfunction forgeRunScriptFunction(request) {\n  request = request || {};\n  const scriptId = forgeString_(request.scriptId).trim();\n  const functionName = forgeString_(request.functionName).trim();\n  forgeAssert_(scriptId && functionName, 'scriptId and functionName are required.');\n  forgeAssert_(/^forge|^test|^pulseRun|^hipJointTest/.test(functionName), 'Remote function is not on the Forge test allowlist.');\n  const result = forgeApiFetch_(FORGE_SCRIPT_API_BASE_ + '/scripts/' + encodeURIComponent(scriptId) + ':run', {\n    method: 'post',\n    payload: {\n      function: functionName,\n      parameters: request.parameters || [],\n      devMode: request.devMode !== false\n    }\n  });\n  return forgeResult_(!result.error, {\n    scriptId: scriptId,\n    functionName: functionName,\n    response: result,\n    writesPerformedByForge: false\n  });\n}\n"}, {"path": "pulse-forge/core/ForgeRegistry.gs", "content": "/** Persistent registry and A/B engine slot controls. */\nconst FORGE_REGISTRY_KEY_ = 'PULSE_FORGE_PROJECT_REGISTRY_V1';\nconst FORGE_ACTIVE_ENGINE_KEY_ = 'PULSE_FORGE_ACTIVE_ENGINE_SLOT';\n\nfunction forgeRegistryProps_() {\n  return PropertiesService.getScriptProperties();\n}\n\nfunction forgeRegistryRead_() {\n  const raw = forgeRegistryProps_().getProperty(FORGE_REGISTRY_KEY_);\n  if (!raw) return { projects: {}, updatedAt: null };\n  try {\n    const parsed = JSON.parse(raw);\n    return parsed && parsed.projects ? parsed : { projects: {}, updatedAt: null };\n  } catch (error) {\n    throw new Error('Forge registry is invalid JSON: ' + error.message);\n  }\n}\n\nfunction forgeRegistryWrite_(registry) {\n  const copy = forgeClone_(registry || { projects: {} });\n  copy.updatedAt = forgeNowIso_();\n  forgeRegistryProps_().setProperty(FORGE_REGISTRY_KEY_, forgeStableJson_(copy));\n  return copy;\n}\n\nfunction forgeRegisterProject(project) {\n  project = project || {};\n  const alias = forgeString_(project.alias).trim().toUpperCase();\n  const scriptId = forgeString_(project.scriptId).trim();\n  const environment = forgeString_(project.environment).trim().toUpperCase();\n  forgeAssert_(/^[A-Z0-9_\\-]+$/.test(alias), 'Project alias is required and must be simple text.');\n  forgeAssert_(scriptId, 'scriptId is required.');\n  forgeAssert_(FORGE_CORE.ENVIRONMENTS.indexOf(environment) >= 0, 'Unsupported Forge environment.');\n\n  const registry = forgeRegistryRead_();\n  registry.projects[alias] = {\n    alias: alias,\n    scriptId: scriptId,\n    environment: environment,\n    allowHeadWrite: environment !== 'PRODUCTION' && project.allowHeadWrite === true,\n    allowTestDeployment: environment !== 'PRODUCTION' && project.allowTestDeployment === true,\n    productionDeploymentId: environment === 'PRODUCTION' ? forgeString_(project.productionDeploymentId) : '',\n    description: forgeString_(project.description),\n    updatedAt: forgeNowIso_()\n  };\n  forgeRegistryWrite_(registry);\n  return forgeResult_(true, { project: forgeClone_(registry.projects[alias]) });\n}\n\nfunction forgeListRegisteredProjects() {\n  const registry = forgeRegistryRead_();\n  return forgeResult_(true, {\n    activeEngineSlot: forgeGetActiveEngineSlot_(),\n    projects: Object.keys(registry.projects).sort().map(function(alias) {\n      return forgeClone_(registry.projects[alias]);\n    })\n  });\n}\n\nfunction forgeRegistryGetProject_(alias) {\n  const key = forgeString_(alias).trim().toUpperCase();\n  const project = forgeRegistryRead_().projects[key];\n  forgeAssert_(project, 'Forge project is not registered: ' + key);\n  return forgeClone_(project);\n}\n\nfunction forgeGetActiveEngineSlot_() {\n  return forgeRegistryProps_().getProperty(FORGE_ACTIVE_ENGINE_KEY_) || 'ENGINE_A';\n}\n\nfunction forgeSetActiveEngineSlot(slot, validationReceipt) {\n  const normalized = forgeString_(slot).trim().toUpperCase();\n  forgeAssert_(normalized === 'ENGINE_A' || normalized === 'ENGINE_B', 'Engine slot must be ENGINE_A or ENGINE_B.');\n  forgeAssert_(validationReceipt && validationReceipt.ok === true, 'A passing validation receipt is required.');\n  forgeAssert_(forgeString_(validationReceipt.slot).toUpperCase() === normalized, 'Validation receipt slot mismatch.');\n  forgeRegistryProps_().setProperty(FORGE_ACTIVE_ENGINE_KEY_, normalized);\n  return forgeResult_(true, { activeEngineSlot: normalized, automaticDeployment: false });\n}\n"}, {"path": "pulse-forge/core/ForgeValidator.gs", "content": "/** Static package validation and deterministic no-write checks. */\nconst FORGE_SECRET_PATTERNS_ = Object.freeze([\n  /BEGIN (?:RSA )?PRIVATE KEY/,\n  /AIza[0-9A-Za-z\\-_]{30,}/,\n  /gh[pousr]_[0-9A-Za-z]{20,}/,\n  /sk-[0-9A-Za-z]{20,}/\n]);\nconst FORGE_FORBIDDEN_PRODUCTION_MARKERS_ = Object.freeze([\n  'automaticMerge:true',\n  'automaticDeployment:true',\n  'FORGE_AUTO_PRODUCTION=true'\n]);\n\nfunction forgeExtractFunctionNames_(source) {\n  const names = [];\n  const regex = /^function\\s+([A-Za-z_$][\\w$]*)\\s*\\(/gm;\n  let match;\n  while ((match = regex.exec(forgeNormalizeText_(source)))) names.push(match[1]);\n  return names;\n}\n\nfunction forgeValidateManifest_(file, problems) {\n  try {\n    const manifest = JSON.parse(file.source);\n    const scopes = manifest.oauthScopes || [];\n    const forbidden = [\n      'https://www.googleapis.com/auth/cloud-platform',\n      'https://mail.google.com/'\n    ];\n    forbidden.forEach(function(scope) {\n      if (scopes.indexOf(scope) >= 0) problems.push('Forbidden broad OAuth scope: ' + scope);\n    });\n  } catch (error) {\n    problems.push('appsscript manifest is invalid JSON: ' + error.message);\n  }\n}\n\nfunction forgeValidatePackage(packageSpec) {\n  packageSpec = packageSpec || {};\n  const problems = [];\n  const warnings = [];\n  let files = [];\n  try {\n    files = forgeCanonicalFiles_(packageSpec.files || []);\n  } catch (error) {\n    return forgeResult_(false, { problems: [error.message], warnings: [], files: [] });\n  }\n\n  if (!files.length) problems.push('Project package contains no files.');\n  if (files.length > FORGE_CORE.MAX_FILES_PER_PROJECT) problems.push('Project file count exceeds Forge limit.');\n  const totalBytes = files.reduce(function(sum, file) { return sum + forgeUtf8Bytes_(file.source); }, 0);\n  if (totalBytes > FORGE_CORE.MAX_SOURCE_BYTES) problems.push('Project source exceeds Forge byte limit.');\n\n  const manifestFiles = files.filter(function(file) { return file.name === 'appsscript' && file.type === 'JSON'; });\n  if (manifestFiles.length !== 1) problems.push('Exactly one JSON file named appsscript is required.');\n  if (manifestFiles[0]) forgeValidateManifest_(manifestFiles[0], problems);\n\n  const allFunctions = [];\n  files.filter(function(file) { return file.type === 'SERVER_JS'; }).forEach(function(file) {\n    forgeExtractFunctionNames_(file.source).forEach(function(name) {\n      allFunctions.push({ name: name, file: file.name });\n    });\n  });\n  const grouped = {};\n  allFunctions.forEach(function(item) {\n    grouped[item.name] = grouped[item.name] || [];\n    grouped[item.name].push(item.file);\n  });\n  Object.keys(grouped).forEach(function(name) {\n    if (grouped[name].length > 1) problems.push('Duplicate server function ' + name + ' in ' + grouped[name].join(', '));\n  });\n\n  files.forEach(function(file) {\n    FORGE_SECRET_PATTERNS_.forEach(function(pattern) {\n      if (pattern.test(file.source)) problems.push('Possible secret in ' + file.name + ': ' + pattern);\n    });\n    FORGE_FORBIDDEN_PRODUCTION_MARKERS_.forEach(function(marker) {\n      if (file.source.indexOf(marker) >= 0) problems.push('Forbidden automatic production marker in ' + file.name + ': ' + marker);\n    });\n    if (/\\b(eval|new Function)\\s*\\(/.test(file.source)) warnings.push('Dynamic code execution marker in ' + file.name + '.');\n  });\n\n  const requiredFunctions = packageSpec.requiredFunctions || [];\n  requiredFunctions.forEach(function(name) {\n    if (!grouped[name]) problems.push('Required server function missing: ' + name);\n  });\n\n  return forgeResult_(problems.length === 0, {\n    packageId: forgeString_(packageSpec.packageId),\n    packageHash: forgePackageHash_(files),\n    totalBytes: totalBytes,\n    fileCount: files.length,\n    files: forgeFileInventory_(files),\n    problems: problems,\n    warnings: warnings,\n    writesPerformed: false\n  });\n}\n\nfunction forgeCompareInventories_(leftFiles, rightFiles) {\n  const left = {};\n  const right = {};\n  forgeFileInventory_(leftFiles).forEach(function(item) { left[item.name] = item; });\n  forgeFileInventory_(rightFiles).forEach(function(item) { right[item.name] = item; });\n  const names = Object.keys(Object.assign({}, left, right)).sort();\n  const results = names.map(function(name) {\n    const a = left[name];\n    const b = right[name];\n    return {\n      name: name,\n      status: !a ? 'RIGHT_ONLY' : !b ? 'LEFT_ONLY' : a.sha256 === b.sha256 ? 'MATCH' : 'DIFF',\n      left: a || null,\n      right: b || null\n    };\n  });\n  return {\n    match: results.every(function(item) { return item.status === 'MATCH'; }),\n    files: results\n  };\n}\n"}, {"path": "pulse-forge/package.json", "content": "{\n  \"name\": \"pulse-forge\",\n  \"version\": \"0.1.0\",\n  \"private\": true,\n  \"type\": \"module\",\n  \"scripts\": {\n    \"validate\": \"node tests/validate.mjs\"\n  }\n}\n"}, {"path": "pulse-forge/templates/engine-slot/Engine.gs", "content": "/** Replaceable Forge Engine slot. The stable controller builds this project. */\nconst FORGE_ENGINE = Object.freeze({\n  SLOT: '__ENGINE_SLOT__',\n  VERSION: '__ENGINE_VERSION__',\n  PACKAGE_HASH: '__PACKAGE_HASH__'\n});\n\nfunction forgeEngineSelfTest() {\n  return {\n    ok: true,\n    slot: FORGE_ENGINE.SLOT,\n    version: FORGE_ENGINE.VERSION,\n    packageHash: FORGE_ENGINE.PACKAGE_HASH,\n    writesPerformed: false\n  };\n}\n"}, {"path": "pulse-forge/templates/engine-slot/appsscript.json", "content": "{\n  \"timeZone\": \"America/New_York\",\n  \"dependencies\": {},\n  \"exceptionLogging\": \"STACKDRIVER\",\n  \"runtimeVersion\": \"V8\",\n  \"executionApi\": { \"access\": \"MYSELF\" },\n  \"oauthScopes\": [\n    \"https://www.googleapis.com/auth/script.external_request\"\n  ]\n}\n"}, {"path": "pulse-forge/tests/validate.mjs", "content": "import fs from 'node:fs';\nimport path from 'node:path';\nimport vm from 'node:vm';\nimport crypto from 'node:crypto';\n\nconst root = path.resolve('pulse-forge');\nconst gsFiles = [\n  'core/ForgeCore.gs',\n  'core/ForgeRegistry.gs',\n  'core/ForgeValidator.gs',\n  'core/ForgeProjectApi.gs',\n  'core/ForgeGitHub.gs',\n  'controller/ForgeTemplates.gs',\n  'controller/Code.gs'\n].map((name) => path.join(root, name));\nconst manifestPath = path.join(root, 'appsscript.json');\nconst problems = [];\n\nfor (const file of gsFiles) {\n  if (!fs.existsSync(file)) {\n    problems.push(`Missing Forge file: ${file}`);\n    continue;\n  }\n  const source = fs.readFileSync(file, 'utf8');\n  try {\n    new vm.Script(source, { filename: file });\n  } catch (error) {\n    problems.push(`${file} syntax error: ${error.message}`);\n  }\n}\n\nlet manifest = {};\ntry {\n  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));\n} catch (error) {\n  problems.push(`Manifest error: ${error.message}`);\n}\n\nconst requiredScopes = [\n  'https://www.googleapis.com/auth/script.projects',\n  'https://www.googleapis.com/auth/script.deployments',\n  'https://www.googleapis.com/auth/script.external_request',\n  'https://www.googleapis.com/auth/spreadsheets'\n];\nconst scopes = manifest.oauthScopes || [];\nfor (const scope of requiredScopes) {\n  if (!scopes.includes(scope)) problems.push(`Missing required Forge scope: ${scope}`);\n}\nfor (const forbidden of ['https://www.googleapis.com/auth/cloud-platform', 'https://mail.google.com/']) {\n  if (scopes.includes(forbidden)) problems.push(`Forbidden broad scope: ${forbidden}`);\n}\n\nconst sources = gsFiles.filter(fs.existsSync).map((file) => ({ file, source: fs.readFileSync(file, 'utf8') }));\nconst combined = sources.map((item) => item.source).join('\\n');\nconst names = [...combined.matchAll(/^function\\s+([A-Za-z_$][\\w$]*)\\s*\\(/gm)].map((match) => match[1]);\nconst duplicateNames = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];\nif (duplicateNames.length) problems.push(`Duplicate Forge functions: ${duplicateNames.join(', ')}`);\n\nfor (const marker of [\n  'function forgeGitHubCreatePullRequest(request)',\n  'function forgeBootstrapEngineSlots()',\n  'function forgeWithBuildLock_(callback)',\n  'function forgeControllerStatus()',\n  'function forgePrepareProjectBuild(request)',\n  'function forgeApplyProjectBuild(request)',\n  'function forgeBuildInactiveEngine(request)',\n  'function forgeControllerSelfTest()',\n  'function forgeCreateScriptProject(spec)',\n  'function forgeUpdateScriptContent(request)',\n  'function forgeCreateScriptVersion(scriptId, description)',\n  'function forgeCreateTestDeployment(request)',\n  'function forgeValidatePackage(packageSpec)'\n]) {\n  if (!combined.includes(marker)) problems.push(`Required Forge marker missing: ${marker}`);\n}\n\nfor (const forbidden of [\n  'merge_pull_request',\n  '/merges',\n  'AUTOMATIC_MERGE: true',\n  'AUTOMATIC_PRODUCTION_DEPLOYMENT: true',\n  \"project.environment === 'PRODUCTION' && project.allowHeadWrite\"\n]) {\n  if (combined.includes(forbidden)) problems.push(`Forbidden Forge marker: ${forbidden}`);\n}\n\nif (!combined.includes(\"project.environment !== 'PRODUCTION'\")) {\n  problems.push('Non-production HEAD write guard is missing.');\n}\nif (!combined.includes(\"productionDeploymentId: environment === 'PRODUCTION'\")) {\n  problems.push('Production registry handling marker is missing.');\n}\nif (!combined.includes(\"const target = active === 'ENGINE_A' ? 'ENGINE_B' : 'ENGINE_A';\")) {\n  problems.push('A/B inactive-engine selection is missing.');\n}\nif (!combined.includes(\"'Rollback before ' + forgeString_\")) {\n  problems.push('Pre-update immutable rollback version is missing.');\n}\n\n\nconst propertyStore = new Map();\nconst context = {\n  console,\n  Date,\n  JSON,\n  Object,\n  Array,\n  String,\n  Number,\n  Boolean,\n  Math,\n  RegExp,\n  Error,\n  encodeURIComponent,\n  Utilities: {\n    Charset: { UTF_8: 'UTF_8' },\n    DigestAlgorithm: { SHA_256: 'SHA_256' },\n    newBlob: (value) => ({ getBytes: () => [...Buffer.from(String(value), 'utf8')] }),\n    computeDigest: (_algorithm, value) => [...crypto.createHash('sha256').update(String(value), 'utf8').digest()],\n    getUuid: () => '00000000-0000-4000-8000-000000000000'\n  },\n  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },\n  PropertiesService: {\n    getScriptProperties: () => ({\n      getProperty: (key) => propertyStore.get(key) ?? null,\n      setProperty: (key, value) => { propertyStore.set(key, String(value)); },\n      deleteProperty: (key) => { propertyStore.delete(key); }\n    })\n  },\n  ScriptApp: { getOAuthToken: () => 'TEST_TOKEN' },\n  UrlFetchApp: { fetch: () => { throw new Error('Network call attempted during local validation'); } },\n  Session: { getScriptTimeZone: () => 'America/New_York' }\n};\nvm.createContext(context);\ntry {\n  new vm.Script(combined, { filename: 'pulse-forge/combined.gs' }).runInContext(context);\n  const selfTest = context.forgeControllerSelfTest();\n  if (!selfTest || selfTest.ok !== true) problems.push('Forge controller self-test failed in mocked Apps Script runtime.');\n  const secretTest = context.forgeValidatePackage({\n    packageId: 'SECRET-TEST',\n    files: [\n      { name: 'Code', type: 'SERVER_JS', source: 'const token=\"ghp_123456789012345678901234567890\";' },\n      { name: 'appsscript', type: 'JSON', source: '{\"timeZone\":\"America/New_York\",\"runtimeVersion\":\"V8\"}' }\n    ]\n  });\n  if (secretTest.ok !== false) problems.push('Secret-pattern validation did not fail closed.');\n  let duplicateBlocked = false;\n  try {\n    context.forgeCanonicalFiles_([\n      { name: 'Code', type: 'SERVER_JS', source: '' },\n      { name: 'code', type: 'SERVER_JS', source: '' }\n    ]);\n  } catch (_error) {\n    duplicateBlocked = true;\n  }\n  if (!duplicateBlocked) problems.push('Case-insensitive duplicate file names were not blocked.');\n} catch (error) {\n  problems.push(`Mocked Apps Script execution failed: ${error.message}`);\n}\n\nconst report = {\n  ok: problems.length === 0,\n  checkedAt: new Date().toISOString(),\n  gsFiles: gsFiles.length,\n  functions: names.length,\n  duplicateFunctions: duplicateNames,\n  scopes,\n  problems\n};\nconsole.log(JSON.stringify(report, null, 2));\nif (problems.length) process.exit(1);\n"}]);

function forgeBootstrapRepositoryPullRequest() {
  const selfTest = forgeControllerSelfTest();
  forgeAssert_(selfTest.ok === true, 'Forge self-test failed; repository PR was not created.');
  const connection = forgeGitHubConnectionTest();
  const stamp = Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd-HHmmss');
  const branch = 'pulse/pulse-076-forge-foundation-' + stamp;
  return forgeGitHubCreatePullRequest({
    baseBranch: connection.defaultBranch || 'main',
    headBranch: branch,
    title: 'PULSE-076: Add permanent Pulse Forge controller foundation',
    commitMessage: 'PULSE-076: add permanent Pulse Forge controller foundation',
    body: [
      '## Pulse Forge foundation',
      '',
      '- Adds a stable Apps Script controller.',
      '- Adds complete-project create/read/update/version/test-deployment operations.',
      '- Adds A/B engine slots and immutable pre-update rollback versions.',
      '- Adds reusable ForgeCore functions for Pulse, Hip Joint OS, and future projects.',
      '- Adds an atomic Git tree/commit/branch/PR adapter.',
      '- Does not merge or deploy production automatically.',
      '',
      'Controller self-test passed before this PR was created.'
    ].join('\n'),
    files: FORGE_BOOTSTRAP_REPOSITORY_FILES_,
    draft: false
  });
}

function forgeBootstrapStatus() {
  return forgeResult_(true, {
    controller: forgeControllerStatus(),
    github: forgeGitHubConnectionTest(),
    repositoryFileCount: FORGE_BOOTSTRAP_REPOSITORY_FILES_.length,
    nextFunctions: [
      'forgeBootstrapRepositoryPullRequest',
      'forgeBootstrapEngineSlots'
    ],
    writesPerformed: false
  });
}
