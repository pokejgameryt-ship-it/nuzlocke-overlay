// Node.js scraper using Google Drive API v3
// Usage: node scripts/scrape-gdrive.js YOUR_API_KEY
// This runs locally and generates the complete manifest.
// The manifest is then committed to GitHub so end users don't need any API key.

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.argv[2];
const SPRITES_FOLDER_ID = '1SUAab5By3_apRmmPosfBDpfu7GstHiSA';
const ROOT_FOLDER_ID = '1itRjBo1HfZI_dUCa5PptR3x-OiEXppQI';

if (!API_KEY) {
  console.error('Usage: node scripts/scrape-gdrive.js YOUR_GOOGLE_API_KEY');
  console.error('');
  console.error('To get an API key:');
  console.error('1. Go to https://console.cloud.google.com');
  console.error('2. Create a project (or use existing)');
  console.error('3. Enable "Google Drive API" in APIs & Services');
  console.error('4. Create an API key in Credentials');
  console.error('5. Run this script with the key');
  process.exit(1);
}

function apiGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'NuzlockeOverlay-Scraper/1.0' } }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error('HTTP ' + res.statusCode + ': ' + data.substring(0, 200)));
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error')); }
      });
    }).on('error', reject);
  });
}

async function listFilesInFolder(folderId, folderPath, files, onProgress) {
  let pageToken = null;
  
  do {
    const query = encodeURIComponent("'" + folderId + "' in parents and trashed = false");
    const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType)');
    let url = `https://www.googleapis.com/drive/v3/files?key=${API_KEY}&q=${query}&fields=${fields}&pageSize=1000`;
    if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);
    
    const response = await apiGet(url);
    const items = response.files || [];
    
    for (const item of items) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        const subPath = folderPath ? folderPath + '/' + item.name : item.name;
        await listFilesInFolder(item.id, subPath, files, onProgress);
      } else {
        const filePath = folderPath ? folderPath + '/' + item.name : item.name;
        files.push({ id: item.id, name: item.name, path: filePath });
      }
    }
    
    pageToken = response.nextPageToken;
    
    if (onProgress) onProgress(files.length, folderPath);
  } while (pageToken);
}

async function main() {
  console.log('Starting Google Drive scrape...');
  console.log('Sprites folder ID:', SPRITES_FOLDER_ID);
  
  const files = [];
  let lastLog = Date.now();
  
  await listFilesInFolder(SPRITES_FOLDER_ID, '', files, (count, fpath) => {
    if (Date.now() - lastLog > 2000) {
      console.log(`  ${count} files found (scanning: ${fpath || '/'})...`);
      lastLog = Date.now();
    }
  });
  
  const manifest = {
    version: 1,
    scrapedAt: new Date().toISOString(),
    rootFolderId: ROOT_FOLDER_ID,
    spritesFolderId: SPRITES_FOLDER_ID,
    files: files
  };
  
  const outPath = path.join(__dirname, '..', 'public', 'recursos-manifest.json');
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  
  console.log(`\nDone! ${files.length} files written to ${outPath}`);
  console.log('Commit this file to GitHub.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
