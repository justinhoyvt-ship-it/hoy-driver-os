import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const validation = spawnSync(process.execPath, ['scripts/validate.mjs'], { stdio: 'inherit' });
if (validation.status !== 0) process.exit(validation.status ?? 1);

const dist = path.resolve('dist');
const stage = path.join(dist, 'PulseOS_Runtime_Lite_v1_4_2');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

for (const name of ['Code.gs', 'appsscript.json', 'INSTALL_FIRST.txt']) {
  fs.copyFileSync(path.join('runtime', name), path.join(stage, name));
}
fs.copyFileSync(path.join(dist, 'VALIDATION.json'), path.join(stage, 'VALIDATION.json'));

const buildInfo = {
  release: 'Pulse OS Runtime Lite v1.4.2',
  builtAt: new Date().toISOString(),
  gitSha: process.env.GITHUB_SHA || 'local',
  githubRunId: process.env.GITHUB_RUN_ID || 'local',
  deploymentModel: 'GitHub autobuild; manual Apps Script deployment; no Apps Script API.'
};
fs.writeFileSync(path.join(stage, 'BUILD_INFO.json'), `${JSON.stringify(buildInfo, null, 2)}\n`);

const shortSha = buildInfo.gitSha === 'local' ? 'local' : buildInfo.gitSha.slice(0, 8);
const zipPath = path.join(dist, `PulseOS_Runtime_Lite_v1_4_2_${shortSha}.zip`);
fs.rmSync(zipPath, { force: true });
const zip = spawnSync('python3', ['-c', [
  'import os, sys, zipfile',
  'src, out = sys.argv[1], sys.argv[2]',
  'with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:',
  '  for root, _, files in os.walk(src):',
  '    for name in sorted(files):',
  '      p = os.path.join(root, name)',
  '      z.write(p, os.path.relpath(p, src))'
].join('\n'), stage, zipPath], { stdio: 'inherit' });
if (zip.status !== 0) process.exit(zip.status ?? 1);

const result = {
  ok: true,
  artifact: path.basename(zipPath),
  bytes: fs.statSync(zipPath).size,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex'),
  builtAt: buildInfo.builtAt
};
fs.writeFileSync(path.join(dist, 'AUTOBUILD_RESULT.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
