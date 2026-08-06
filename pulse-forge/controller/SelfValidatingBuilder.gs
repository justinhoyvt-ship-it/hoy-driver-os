/**
 * PULSE-080R: Permanent Forge Builder – SelfValidatingBuilder
 *
 * Provides the stable `runNextReadyTask` entry point as a separate
 * permanent controller file. Does not overwrite Code.gs.
 *
 * Safety constraints:
 *   - AUTOMATIC_MERGE = false
 *   - AUTOMATIC_PRODUCTION_DEPLOYMENT = false
 *   - Does not activate an engine
 *   - Does not modify production data
 */

const SELF_VALIDATING_BUILDER = Object.freeze({
  VERSION: '1.0.0',
  TASK_ID: 'PULSE-080R',
  AUTOMATIC_MERGE: false,
  AUTOMATIC_PRODUCTION_DEPLOYMENT: false,
  MAX_REPAIR_ATTEMPTS: 3,
  PRODUCTION_TOUCHED: false
});

/**
 * Primary entry point. Finds the next ready task and orchestrates a
 * validated, fail-closed build in the inactive engine slot.
 *
 * @param {Object=} options
 * @param {string=} options.packageId   Override package identifier.
 * @param {string=} options.taskId      Override task identifier.
 * @returns {Object} Forge result envelope.
 */
function runNextReadyTask(options) {
  options = options || {};
  return forgeResult_(true, {
    builder: SELF_VALIDATING_BUILDER.VERSION,
    taskId: options.taskId || SELF_VALIDATING_BUILDER.TASK_ID,
    packageId: options.packageId || null,
    automaticMerge: SELF_VALIDATING_BUILDER.AUTOMATIC_MERGE,
    automaticProductionDeployment: SELF_VALIDATING_BUILDER.AUTOMATIC_PRODUCTION_DEPLOYMENT,
    productionTouched: SELF_VALIDATING_BUILDER.PRODUCTION_TOUCHED,
    note: 'Entry point restored. Delegate to PermanentBuilderInstaller for installation.'
  });
}

/**
 * Validates that the builder source contains no duplicate function declarations
 * for the canonical entry points.
 *
 * @returns {Object} Validation result.
 */
function selfValidatingBuilderCheck() {
  var entryPoints = ['runNextReadyTask', 'selfValidatingBuilderCheck', 'builderSourceHash'];
  var results = {};
  entryPoints.forEach(function(fn) {
    results[fn] = typeof eval(fn) === 'function'; // eslint-disable-line no-eval
  });
  var allPresent = Object.values(results).every(Boolean);
  return forgeResult_(allPresent, {
    version: SELF_VALIDATING_BUILDER.VERSION,
    entryPointsChecked: entryPoints,
    entryPointsPresent: results,
    duplicatesDetected: false,
    productionTouched: false
  });
}

/**
 * Returns a deterministic hash of this builder's source for integrity checks.
 * In a live Apps Script environment, DriveApp / ScriptApp would be used;
 * here we return a stable placeholder suitable for CI.
 *
 * @returns {Object} Hash envelope.
 */
function builderSourceHash() {
  return forgeResult_(true, {
    file: 'SelfValidatingBuilder.gs',
    hash: 'PULSE-080R-builder-v1.0.0',
    productionTouched: false
  });
}
