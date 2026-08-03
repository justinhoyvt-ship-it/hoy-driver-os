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
