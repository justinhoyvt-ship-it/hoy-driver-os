import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repo = process.cwd();
const bundleDir = path.join(repo, '.pulse-repair');
const parts = fs.readdirSync(bundleDir)
  .filter(name => /^part-\d+$/.test(name))
  .sort();
if (!parts.length) throw new Error('No repair bundle parts found.');
const encoded = parts.map(name => fs.readFileSync(path.join(bundleDir, name), 'utf8')).join('');
const zipPath = path.join(bundleDir, 'PULSE-080R-PR50-repair.zip');
fs.writeFileSync(zipPath, Buffer.from(encoded, 'base64'));
execFileSync('unzip', ['-o', zipPath, '-d', repo], { stdio: 'inherit' });
console.log('PULSE-080R PR #50 repair package applied.');
