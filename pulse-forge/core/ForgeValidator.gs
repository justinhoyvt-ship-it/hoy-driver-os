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
