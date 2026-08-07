import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const cwd = process.cwd();
const root = path.basename(cwd) === 'pulse-forge'
  ? cwd
  : path.resolve(cwd, 'pulse-forge');
const manifestPath = path.join(root, 'tasks/PULSE-080/task-package.json');
const planPath = path.join(root, 'tasks/PULSE-080/candidate/release-plan.json');
const sourceMapPath = path.join(root, 'tasks/PULSE-080/staging/source-map.json');
const problems = [];

let manifest = null;
let plan = null;
let sourceMap = null;
let planText = null;
try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (error) { problems.push('Manifest parse/read failed: ' + error.message); }
try { planText = fs.readFileSync(planPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'); plan = JSON.parse(planText); } catch (error) { problems.push('Release plan parse/read failed: ' + error.message); }
try { sourceMap = JSON.parse(fs.readFileSync(sourceMapPath, 'utf8')); } catch (error) { problems.push('Source-map parse/read failed: ' + error.message); }

if (manifest) {
  if (manifest.schemaVersion !== 1) problems.push('schemaVersion must be 1.');
  if (manifest.taskId !== 'PULSE-080') problems.push('taskId must be PULSE-080.');
  if (manifest.repository !== 'justinhoyvt-ship-it/hoy-driver-os') problems.push('repository mismatch.');
  if (manifest.baseBranch !== 'main') problems.push('baseBranch must be main.');
  if (manifest.branch !== 'pulse/pulse-080') problems.push('stable PULSE-080 branch mismatch.');
  if (!manifest.pullRequest || !manifest.pullRequest.title) problems.push('pullRequest.title is required.');
  if (!manifest.production || manifest.production.automaticMerge !== false || manifest.production.automaticDeployment !== false || manifest.production.activateEngine !== false) problems.push('production safety flags must all be false.');
  if (!manifest.ci || !Array.isArray(manifest.ci.requiredChecks) || !manifest.ci.requiredChecks.includes('validate-forge')) problems.push('validate-forge is required.');
  if (!Array.isArray(manifest.repositoryChanges) || manifest.repositoryChanges.length !== 1) problems.push('Exactly one release-plan repository change is required.');
  if (Array.isArray(manifest.repositoryChanges) && manifest.repositoryChanges[0] && planText) {
    const change = manifest.repositoryChanges[0];
    if (change.sourcePath !== 'pulse-forge/tasks/PULSE-080/candidate/release-plan.json') problems.push('Unexpected release-plan source path.');
    if (change.targetPath !== 'pulse-forge/releases/PULSE-080/release-plan.json') problems.push('Unexpected release-plan target path.');
    const digest = crypto.createHash('sha256').update(planText, 'utf8').digest('hex');
    if (change.sha256 !== digest) problems.push('Release-plan SHA-256 mismatch.');
  }
  if (!Array.isArray(manifest.stagingProjects) || manifest.stagingProjects.length !== 2) problems.push('Exactly two staging projects are required.');
  const stages = Array.isArray(manifest.stagingProjects) ? manifest.stagingProjects : [];
  const expected = new Map([['PULSE080_REQUEST_STAGE','pulse-forge/tasks/PULSE-080/staging/request-app'],['PULSE080_HOY_STAGE','pulse-forge/tasks/PULSE-080/staging/hoy-driver']]);
  const canonicalExpected = new Map([['PULSE080_REQUEST_STAGE','pulse-autobuild/request-app'],['PULSE080_HOY_STAGE','apps-script/hoy-driver-os-writer']]);
  for (const stage of stages) {
    if (!expected.has(stage.projectAlias)) problems.push('Unexpected staging alias: ' + String(stage.projectAlias));
    else if (expected.get(stage.projectAlias) !== stage.sourceRoot) problems.push('Wrong sourceRoot for ' + stage.projectAlias);
    if (canonicalExpected.has(stage.projectAlias) && canonicalExpected.get(stage.projectAlias) !== stage.canonicalSourceRoot) problems.push('Wrong canonicalSourceRoot for ' + stage.projectAlias);
    if (!/^[a-f0-9]{64}$/.test(String(stage.expectedLivePackageHash || ''))) problems.push('Missing/invalid expectedLivePackageHash for ' + stage.projectAlias);
    if (stage.createTestDeployment !== true) problems.push('createTestDeployment must be true for ' + stage.projectAlias);
    if (stage.activateEngine !== false) problems.push('activateEngine must be false for ' + stage.projectAlias);
    if (!Array.isArray(stage.requiredFunctions) || !stage.requiredFunctions.includes('doGet')) problems.push('doGet must be required for ' + stage.projectAlias);
  }
}

if (sourceMap) {
  if (sourceMap.taskId !== 'PULSE-080' || sourceMap.schemaVersion !== 1) problems.push('Source-map identity mismatch.');
  if (!Array.isArray(sourceMap.packages) || sourceMap.packages.length !== 2) problems.push('Source-map must contain exactly two packages.');
  for (const pkg of (sourceMap.packages || [])) {
    if (!Array.isArray(pkg.files) || !pkg.files.length) problems.push('Source-map package has no files: ' + String(pkg.role));
    const names = new Set();
    for (const file of (pkg.files || [])) {
      const key = String(file.appsScriptName || '').toLowerCase();
      if (!key) problems.push('Source-map file is missing appsScriptName.');
      else if (names.has(key)) problems.push('Duplicate Apps Script name in source map: ' + file.appsScriptName);
      names.add(key);
      if (!/^[a-f0-9]{64}$/.test(String(file.sha256 || ''))) problems.push('Invalid source-map file SHA-256: ' + String(file.sourcePath));
    }
  }
}

if (plan) {
  if (plan.taskId !== 'PULSE-080' || plan.release !== 'PHASE_2A_DIRECT_RIDE_BETA') problems.push('Release plan identity mismatch.');
  if (!plan.safety || plan.safety.automaticGitHubMerge !== false || plan.safety.automaticProductionDeployment !== false || plan.safety.engineActivation !== false || plan.safety.productionDataMutationByForge !== false || plan.safety.ownerProductionApprovalRequired !== true) problems.push('Release-plan safety contract mismatch.');
  if (!plan.rollback || plan.rollback.immutablePreStageVersionRequired !== true || plan.rollback.expectedHeadHashRequired !== true || plan.rollback.isolatedTestDeploymentRequired !== true) problems.push('Rollback gate is incomplete.');
  if (!plan.controlledPhoneTest || !Array.isArray(plan.controlledPhoneTest.stopConditions) || plan.controlledPhoneTest.stopConditions.length < 5) problems.push('Controlled phone-test stop conditions are incomplete.');
}

const report = { ok: problems.length === 0, checkedAt: new Date().toISOString(), problems };
console.log(JSON.stringify(report, null, 2));
if (problems.length) process.exit(1);
