import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Compatibility adapter for the runtime validator's historical Hoy Driver filename.
// Apps Script cannot contain ForegroundPickup.gs and ForegroundPickup.html together,
// so production uses ForegroundPickupServer.gs + ForegroundPickup.html. Run the
// existing validator unchanged except for that filename reference; do not create a
// duplicate .gs alias in the repository or in the Apps Script deployment package.
const here=path.dirname(fileURLToPath(import.meta.url));
const sourcePath=path.join(here,'validate.mjs');
const tempPath=path.join(here,'.validate-current-driver-layout.generated.mjs');
const original=fs.readFileSync(sourcePath,'utf8');
const patched=original.replaceAll('ForegroundPickup.gs','ForegroundPickupServer.gs');

if(original===patched){
  console.error('Runtime validator adapter could not find the historical ForegroundPickup.gs reference.');
  process.exit(1);
}

let status=1;
try{
  fs.writeFileSync(tempPath,patched,'utf8');
  const result=spawnSync(process.execPath,[tempPath],{cwd:process.cwd(),stdio:'inherit'});
  status=typeof result.status==='number'?result.status:1;
}finally{
  try{fs.unlinkSync(tempPath);}catch(error){}
}
process.exit(status);
