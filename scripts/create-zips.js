#!/usr/bin/env node
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');

const GDRIVE_DOWNLOAD_URL = 'https://drive.google.com/uc?export=download';
const MANIFEST_URL = 'https://raw.githubusercontent.com/pokejgameryt-ship-it/nuzlocke-overlay/master/public/recursos-manifest.json';
const MAX_PART_SIZE = 1.9 * 1024 * 1024 * 1024;
const CONCURRENCY = 20;

const GENERATIONS = [
  'Gen1', 'Gen2', 'Gen3', 'Gen4', 'Gen5',
  'Gen6', 'Gen7', 'Gen8', 'Gen9', 'LEGENDS ARCEUS'
];

const outDir = path.join(__dirname, '..', 'sprites-zips');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 301 && res.statusCode <= 308 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function downloadFile(fileId) {
  return new Promise((resolve, reject) => {
    const url = GDRIVE_DOWNLOAD_URL + '&id=' + fileId + '&confirm=t';
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      if (res.statusCode >= 301 && res.statusCode <= 308) {
        const loc = res.headers.location;
        if (loc && !loc.includes('virus')) {
          https.get(loc, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res2) => {
            handleDownload(res2, resolve, reject);
          }).on('error', reject);
          return;
        }
      }
      handleDownload(res, resolve, reject);
    }).on('error', reject);
  });
}

function handleDownload(res, resolve, reject) {
  if (res.statusCode === 429 || res.statusCode >= 500) {
    res.resume();
    return reject(new Error('HTTP ' + res.statusCode));
  }
  if (res.statusCode !== 200) {
    res.resume();
    return reject(new Error('HTTP ' + res.statusCode));
  }
  const contentType = (res.headers['content-type'] || '');
  if (contentType.includes('text/html')) {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { body += c; });
    res.on('end', () => {
      const confirmMatch = body.match(/confirm=([0-9A-Za-z_-]+)/);
      const uuidMatch = body.match(/uuid=([0-9A-Za-z_-]+)/);
      const formAction = body.match(/action="([^"]+)"/);
      if (confirmMatch || formAction) {
        let nextUrl = formAction ? formAction[1] : GDRIVE_DOWNLOAD_URL;
        const idMatch = body.match(/id=([0-9A-Za-z_-]+)/);
        const fileId = idMatch ? idMatch[1] : '';
        nextUrl += '&id=' + fileId + '&confirm=' + (confirmMatch ? confirmMatch[1] : 't');
        if (uuidMatch) nextUrl += '&uuid=' + uuidMatch[1];
        https.get(nextUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res2) => {
          handleDownload(res2, resolve, reject);
        }).on('error', reject);
      } else {
        reject(new Error('No download link in HTML'));
      }
    });
    return;
  }
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => resolve(Buffer.concat(chunks)));
  res.on('error', reject);
}

async function downloadWithRetry(fileId, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await downloadFile(fileId);
    } catch (e) {
      if (i < retries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      } else {
        throw e;
      }
    }
  }
}

async function createZipForGeneration(genName, files, manifest) {
  const archiver = require('archiver');
  const zipName = genName.replace(/[^a-zA-Z0-9]/g, '_') + '.zip';
  const zipPath = path.join(outDir, zipName);

  console.log(`[${genName}] ${files.length} files to download`);

  const downloadedFiles = [];
  let idx = 0;
  let done = 0;
  let failed = 0;

  async function worker() {
    while (idx < files.length) {
      const file = files[idx++];
      try {
        const data = await downloadWithRetry(file.id);
        downloadedFiles.push({ path: file.path, data });
        done++;
      } catch (e) {
        console.error(`[${genName}] FAIL: ${file.name} - ${e.message}`);
        failed++;
      }
      if (done % 100 === 0 || done + failed === files.length) {
        console.log(`[${genName}] Progress: ${done + failed}/${files.length} (${failed} failed)`);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) workers.push(worker());
  await Promise.all(workers);

  if (downloadedFiles.length === 0) {
    console.log(`[${genName}] No files downloaded, skipping ZIP`);
    return [];
  }

  downloadedFiles.sort((a, b) => a.path.localeCompare(b.path));

  const totalSize = downloadedFiles.reduce((sum, f) => sum + f.data.length, 0);

  if (totalSize > MAX_PART_SIZE) {
    console.log(`[${genName}] ZIP too large (${(totalSize / 1024 / 1024).toFixed(0)} MB), splitting into parts...`);
    return await createSplitZips(genName, downloadedFiles);
  }

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', () => {
      const size = archive.pointer();
      console.log(`[${genName}] Created ${zipName} (${(size / 1024 / 1024).toFixed(0)} MB)`);
      resolve([{ name: zipName, path: zipPath, size, partIndex: 0, totalParts: 1 }]);
    });

    archive.on('error', reject);
    archive.pipe(output);

    for (const file of downloadedFiles) {
      archive.append(file.data, { name: file.path });
    }

    archive.finalize();
  });
}

async function createSplitZips(genName, downloadedFiles) {
  const partResults = [];
  let partIndex = 0;
  let currentSize = 0;
  let currentFiles = [];

  for (const file of downloadedFiles) {
    if (currentSize + file.data.length > MAX_PART_SIZE && currentFiles.length > 0) {
      const partResult = await writePartZip(genName, currentFiles, partIndex);
      partResults.push(partResult);
      partIndex++;
      currentFiles = [];
      currentSize = 0;
    }
    currentFiles.push(file);
    currentSize += file.data.length;
  }

  if (currentFiles.length > 0) {
    const partResult = await writePartZip(genName, currentFiles, partIndex);
    partResults.push(partResult);
  }

  const totalParts = partResults.length;
  for (const p of partResults) p.totalParts = totalParts;

  return partResults;
}

function writePartZip(genName, files, partIndex) {
  const archiver = require('archiver');
  const safeName = genName.replace(/[^a-zA-Z0-9]/g, '_');
  const zipName = `${safeName}-part${partIndex + 1}.zip`;
  const zipPath = path.join(outDir, zipName);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', () => {
      const size = archive.pointer();
      console.log(`[${genName}] Created ${zipName} (${(size / 1024 / 1024).toFixed(0)} MB)`);
      resolve({ name: zipName, path: zipPath, size, partIndex, totalParts: 0 });
    });

    archive.on('error', reject);
    archive.pipe(output);

    for (const file of files) {
      archive.append(file.data, { name: file.path });
    }

    archive.finalize();
  });
}

async function main() {
  console.log('Fetching manifest...');
  const manifestData = await fetchUrl(MANIFEST_URL);
  const manifest = JSON.parse(manifestData.toString());
  const files = manifest.files || [];
  console.log(`Manifest has ${files.length} files`);

  const filesByGen = {};
  for (const gen of GENERATIONS) filesByGen[gen] = [];

  for (const file of files) {
    const genPrefix = file.path.split('/')[0];
    if (filesByGen[genPrefix]) {
      filesByGen[genPrefix].push(file);
    } else {
      console.log(`Warning: file not in known generation: ${file.path}`);
    }
  }

  const zipManifest = [];

  for (const gen of GENERATIONS) {
    const genFiles = filesByGen[gen];
    if (genFiles.length === 0) {
      console.log(`[${gen}] No files, skipping`);
      continue;
    }

    try {
      const parts = await createZipForGeneration(gen, genFiles, manifest);
      for (const part of parts) {
        zipManifest.push({
          name: part.name,
          generation: gen,
          size: part.size,
          partIndex: part.partIndex,
          totalParts: part.totalParts,
          fileCount: genFiles.length,
          url: `https://github.com/pokejgameryt-ship-it/nuzlocke-overlay/releases/download/sprites-v1/${part.name}`
        });
      }
    } catch (e) {
      console.error(`[${gen}] Failed to create ZIP: ${e.message}`);
    }
  }

  const manifestPath = path.join(__dirname, '..', 'sprites-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    version: 1,
    createdAt: new Date().toISOString(),
    totalFiles: files.length,
    generations: GENERATIONS.map(g => ({ name: g, fileCount: filesByGen[g].length })),
    zips: zipManifest
  }, null, 2));

  console.log(`\nDone! Created ${zipManifest.length} ZIP files in ${outDir}`);
  console.log('Manifest saved to sprites-manifest.json');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
