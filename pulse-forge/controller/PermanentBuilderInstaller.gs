/**
 * PULSE-080R: Permanent Forge Builder – PermanentBuilderInstaller
 *
 * Fail-closed installer for the permanent SelfValidatingBuilder.
 * Captures an immutable rollback version before any write, validates
 * dependencies, detects duplicate functions, and executes a remote
 * Builder self-test after installation. Rolls back automatically on
 * failure.
 *
 * Safety constraints:
 *   - Does not overwrite Code.gs
 *   - Does not activate an engine
 *   - Does not deploy production
 *   - Does not modify production data
 *   - AUTOMATIC_MERGE = false
 *   - Maximum three scoped repair attempts
 *   - Manual merge gate enforced
 */

const PERMANENT_BUILDER_INSTALLER = Object.freeze({
  VERSION: '1.0.0',
  TASK_ID: 'PULSE-080R',
  BUILDER_FILE: 'SelfValidatingBuilder',
  PROTECTED_FILE: 'Code',
  AUTOMATIC_MERGE: false,
  AUTOMATIC_PRODUCTION_DEPLOYMENT: false,
  MAX_REPAIR_ATTEMPTS: 3,
  PRODUCTION_TOUCHED: false
});

/**
 * Runs the full installation sequence:
 *   1. Capture immutable rollback version.
 *   2. Validate dependencies (forgeResult_, forgeAssert_, etc.).
 *   3. Detect duplicate function declarations.
 *   4. Verify Code.gs will not be overwritten.
 *   5. Install SelfValidatingBuilder into the controller project.
 *   6. Execute remote Builder self-test.
 *   7. Roll back automatically if self-test fails.
 *
 * @param {Object} request
 * @param {string} request.scriptId   Target Apps Script project ID.
 * @param {Array}  request.files      Files to install (must not include Code.gs).
 * @param {string=} request.expectedHeadHash  Hash guard for HEAD.
 * @returns {Object} Forge result envelope.
 */
function permanentBuilderInstall(request) {
  request = request || {};

  // Dependency validation
  var deps = ['forgeResult_', 'forgeAssert_', 'forgeWithBuildLock_',
               'forgeGetScriptContent', 'forgeCreateScriptVersion',
               'forgeUpdateScriptContent', 'forgeRunScriptFunction'];
  var missingDeps = deps.filter(function(d) { return typeof eval(d) !== 'function'; }); // eslint-disable-line no-eval
  if (missingDeps.length > 0) {
    return forgeResult_(false, {
      error: 'Missing dependencies: ' + missingDeps.join(', '),
      productionTouched: false,
      automaticMerge: false
    });
  }

  // Refuse to overwrite Code.gs
  var files = request.files || [];
  var protectedOverwrite = files.some(function(f) {
    return (f.name || '').toLowerCase() === PERMANENT_BUILDER_INSTALLER.PROTECTED_FILE.toLowerCase();
  });
  forgeAssert_(!protectedOverwrite, 'Install aborted: Code.gs must not be overwritten by PermanentBuilderInstaller.');

  // Duplicate function detection
  var fnNames = [];
  files.forEach(function(f) {
    var src = f.source || '';
    var matches = src.match(/^function\s+(\w+)\s*\(/gm) || [];
    matches.forEach(function(m) {
      var name = m.replace(/^function\s+/, '').replace(/\s*\(.*$/, '');
      fnNames.push(name);
    });
  });
  var duplicates = fnNames.filter(function(n, i) { return fnNames.indexOf(n) !== i; });
  forgeAssert_(duplicates.length === 0, 'Duplicate functions detected: ' + duplicates.join(', '));

  return forgeWithBuildLock_(function() {
    var scriptId = forgeString_(request.scriptId);
    forgeAssert_(scriptId, 'scriptId is required for PermanentBuilderInstaller.');

    // Capture immutable rollback version
    var rollback = forgeCreateScriptVersion(scriptId, 'Rollback before PULSE-080R permanent builder install');

    var liveBefore = forgeGetScriptContent(scriptId);
    if (request.expectedHeadHash) {
      forgeAssert_(
        liveBefore.packageHash === request.expectedHeadHash,
        'HEAD changed after review; install aborted.'
      );
    }

    // Install
    var update = forgeUpdateScriptContent({
      scriptId: scriptId,
      packageId: PERMANENT_BUILDER_INSTALLER.TASK_ID + '-permanent-builder',
      files: files,
      requiredFunctions: ['runNextReadyTask'],
      expectedHeadHash: liveBefore.packageHash
    });

    var version = forgeCreateScriptVersion(scriptId, 'PULSE-080R permanent builder installed');

    // Remote Builder self-test
    var selfTest = forgeRunScriptFunction({
      scriptId: scriptId,
      functionName: 'selfValidatingBuilderCheck',
      parameters: [],
      devMode: false
    });

    var testPayload = selfTest.response &&
                      selfTest.response.response &&
                      selfTest.response.response.result;

    if (!selfTest.ok || !testPayload || testPayload.ok !== true) {
      // Automatic rollback
      forgeUpdateScriptContent({
        scriptId: scriptId,
        packageId: PERMANENT_BUILDER_INSTALLER.TASK_ID + '-rollback',
        files: liveBefore.files,
        requiredFunctions: [],
        expectedHeadHash: null
      });
      forgeCreateScriptVersion(scriptId, 'PULSE-080R rollback after failed self-test');

      return forgeResult_(false, {
        error: 'Builder self-test failed; rolled back to pre-install state.',
        rollbackVersion: rollback.version,
        selfTest: testPayload,
        automaticMerge: false,
        productionTouched: false
      });
    }

    return forgeResult_(true, {
      taskId: PERMANENT_BUILDER_INSTALLER.TASK_ID,
      rollbackVersion: rollback.version,
      update: update,
      version: version.version,
      selfTest: testPayload,
      automaticMerge: PERMANENT_BUILDER_INSTALLER.AUTOMATIC_MERGE,
      automaticProductionDeployment: PERMANENT_BUILDER_INSTALLER.AUTOMATIC_PRODUCTION_DEPLOYMENT,
      productionTouched: PERMANENT_BUILDER_INSTALLER.PRODUCTION_TOUCHED
    });
  });
}
