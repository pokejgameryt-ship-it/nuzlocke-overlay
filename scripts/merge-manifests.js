// Merge all per-folder manifest JSONs into one complete manifest.
// Place manifest-Gen1.json, manifest-Gen2.json, etc. in the project root, then run:
//   node scripts/merge-manifests.js

const fs = require('fs');
const path = require('path');

const ROOT_FOLDER_ID = '1itRjBo1HfZI_dUCa5PptR3x-OiEXppQI';
const SPRITES_FOLDER_ID = '1SUAab5By3_apRmmPosfBDpfu7GstHiSA';

const folderNames = ['Gen1', 'Gen2', 'Gen3', 'Gen4', 'Gen5', 'Gen6', 'Gen7', 'Gen8', 'Gen9', 'LEGENDS ARCEUS'];

const allFiles = [];

for (const name of folderNames) {
  const filePath = path.join(__dirname, '..', 'manifest-' + name + '.json');
  if (!fs.existsSync(filePath)) {
    console.log('  MISSING: manifest-' + name + '.json');
    continue;
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(name + ': ' + data.files.length + ' files');
  allFiles.push(...data.files);
}

console.log('\nTotal files: ' + allFiles.length);

const manifest = {
  version: 1,
  scrapedAt: new Date().toISOString(),
  rootFolderId: ROOT_FOLDER_ID,
  spritesFolderId: SPRITES_FOLDER_ID,
  files: allFiles
};

const outPath = path.join(__dirname, '..', 'public', 'recursos-manifest.json');
fs.writeFileSync(outPath, JSON.stringify(manifest));
console.log('Written to: public/recursos-manifest.json (' + (fs.statSync(outPath).size / 1024 / 1024).toFixed(2) + ' MB)');
