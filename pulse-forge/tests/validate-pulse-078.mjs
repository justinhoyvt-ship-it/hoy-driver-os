import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const cwd = process.cwd();
const root = path.basename(cwd) === 'pulse-forge'
  ? cwd
  : path.resolve(cwd, 'pulse-forge');
const sourcePath = path.join(root, 'controller/PULSE078SourceReconciliation.gs');
const problems = [];

let source = '';
if (!fs.existsSync(sourcePath)) {
  problems.push(`Missing PULSE-078 file: ${sourcePath}`);
} else {
  source = fs.readFileSync(sourcePath, 'utf8');
  try {
    new vm.Script(source, { filename: sourcePath });
  } catch (error) {
    problems.push(`${sourcePath} syntax error: ${error.message}`);
  }
}

for (const marker of [
  'function forgePulse078RunSourceReconciliation()',
  'function forgePulse078CompareFiles_(liveFiles, repoFiles)',
  'function forgePulse078AssertWriterBoundary_(targets)',
  "authority: 'REPO'",
  "authority: 'LIVE'",
  "rideRequestsWriter: true",
  'appsScriptHeadWrites: 0',
  'productionTouched: false'
]) {
  if (!source.includes(marker)) problems.push(`Missing PULSE-078 marker: ${marker}`);
}

for (const forbidden of [
  'forgeUpdateScriptContent(',
  'forgeCreateTestDeployment(',
  'forgeSetActiveEngineSlot(',
  '/merges',
  'automaticMerge: true'
]) {
  if (source.includes(forbidden)) problems.push(`Forbidden PULSE-078 mutation marker: ${forbidden}`);
}

const propertyStore = new Map();
const context = {
  console,
  Date,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Math,
  RegExp,
  Error,
  encodeURIComponent,
  Buffer,
  Utilities: {
    Charset: { UTF_8: 'UTF_8' },
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    newBlob: (value) => ({
      getBytes: () => [...Buffer.from(String(value), 'utf8')]
    }),
    computeDigest: (_algorithm, value) => [
      ...crypto.createHash('sha256').update(String(value), 'utf8').digest()
    ]
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (key) => propertyStore.get(key) ?? null,
      setProperty: (key, value) => propertyStore.set(key, String(value))
    })
  }
};

const prelude = `
function forgeAssert_(condition, message) {
  if (!condition) throw new Error(String(message || 'assertion failed'));
}
function forgeString_(value) {
  return value === null || value === undefined ? '' : String(value);
}
function forgeNormalizeText_(value) {
  return forgeString_(value).replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');
}
function forgeUtf8Bytes_(value) {
  return Buffer.from(forgeNormalizeText_(value), 'utf8').length;
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
function forgeCanonicalFiles_(files) {
  const normalized = (files || []).map(function(file) {
    return {
      name: forgeString_(file.name).trim(),
      type: forgeString_(file.type).trim().toUpperCase(),
      source: forgeNormalizeText_(file.source)
    };
  }).sort(function(a, b) {
    return a.name.localeCompare(b.name) || a.type.localeCompare(b.type);
  });
  const seen = {};
  normalized.forEach(function(file) {
    const key = file.name.toLowerCase();
    forgeAssert_(!seen[key], 'duplicate file');
    seen[key] = true;
  });
  return normalized;
}
`;

vm.createContext(context);
try {
  new vm.Script(prelude + '\n' + source, { filename: 'pulse-078-combined.gs' }).runInContext(context);
  const result = context.forgePulse078SelfTest();
  if (!result || result.ok !== true) {
    problems.push(`PULSE-078 self-test failed: ${JSON.stringify(result)}`);
  }
} catch (error) {
  problems.push(`PULSE-078 mocked execution failed: ${error.message}`);
}

const report = {
  ok: problems.length === 0,
  checkedAt: new Date().toISOString(),
  problems
};
console.log(JSON.stringify(report, null, 2));
if (problems.length) process.exit(1);
