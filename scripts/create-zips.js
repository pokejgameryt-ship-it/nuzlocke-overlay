#!/usr/bin/env node
const https = require('https');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const args = process.argv.slice(2);
const FROM_DRIVE = args.includes('--from-drive');

const MANIFEST_URL = 'https://raw.githubusercontent.com/pokejgameryt-ship-it/nuzlocke-overlay/master/public/recursos-manifest.json';
const GDRIVE_DOWNLOAD_URL = 'https://drive.google.com/uc?export=download';
const SPRITES_DIR = path.join(__dirname, '..', 'Recursos', 'Sprites');
const DOWNLOAD_DIR = path.join(__dirname, '..', '_drive_sprites');
const outDir = path.join(__dirname, '..', 'sprites-zips');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const MAX_PART_SIZE = 1.9 * 1024 * 1024 * 1024;
const DL_CONCURRENCY = 50;

const GENERATIONS = [
  'Gen1', 'Gen2', 'Gen3', 'Gen4', 'Gen5',
  'Gen6', 'Gen7', 'Gen8', 'Gen9', 'LEGENDS ARCEUS'
];

function getGenForPath(relPath) {
  const top = relPath.split('/')[0];
  if (GENERATIONS.includes(top)) return top;
  return null;
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const doReq = (u, left) => {
      https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode >= 301 && res.statusCode <= 308 && res.headers.location && left > 0) {
          res.resume(); return doReq(res.headers.location, left - 1);
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };
    doReq(url, 5);
  });
}

function downloadGDriveFile(fileId, destPath) {
  return new Promise((resolve, reject) => {
    const url = GDRIVE_DOWNLOAD_URL + '&id=' + fileId + '&confirm=t';
    const doReq = (u, left) => {
      https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, timeout: 20000 }, (res) => {
        if (res.statusCode >= 301 && res.statusCode <= 308 && res.headers.location && left > 0) {
          const loc = res.headers.location;
          res.resume();
          if (loc && !loc.includes('virus')) {
            return doReq(loc, left - 1);
          }
        }
        if (res.statusCode === 429 || res.statusCode >= 500) {
          res.resume(); return reject(new Error('HTTP ' + res.statusCode));
        }
        if (res.statusCode !== 200) {
          res.resume(); return reject(new Error('HTTP ' + res.statusCode));
        }
        if ((res.headers['content-type'] || '').includes('text/html')) {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (c) => { body += c; });
          res.on('end', () => {
            const cm = body.match(/confirm=([0-9A-Za-z_-]+)/);
            if (!cm) return reject(new Error('No confirm'));
            const idMatch = body.match(/id=([0-9A-Za-z_-]+)/);
            let nu = GDRIVE_DOWNLOAD_URL + '&id=' + (idMatch ? idMatch[1] : '') + '&confirm=' + cm[1];
            const um = body.match(/uuid=([0-9A-Za-z_-]+)/);
            if (um) nu += '&uuid=' + um[1];
            https.get(nu, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 }, (r2) => {
              doReq2(r2, destPath, resolve, reject);
            }).on('error', reject);
          });
          return;
        }
        doReq2(res, destPath, resolve, reject);
      }).on('error', reject);
    };

    function doReq2(res, destPath, resolve, reject) {
      if (res.statusCode === 429 || res.statusCode >= 500) {
        res.resume(); return reject(new Error('HTTP ' + res.statusCode));
      }
      if (res.statusCode !== 200) {
        res.resume(); return reject(new Error('HTTP ' + res.statusCode));
      }
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', (e) => { try { fs.unlinkSync(destPath); } catch(ex) {} reject(e); });
    }

    doReq(url, 5);
  });
}

async function downloadFromDrive() {
  console.log('Fetching legacy manifest from GitHub...');
  const mData = await fetchUrl(MANIFEST_URL);
  const manifest = JSON.parse(mData.toString());
  const files = manifest.files || [];
  console.log(`Manifest has ${files.length} files`);

  let idx = 0;
  let done = 0;
  let skipped = 0;
  let failed = 0;
  let lastLog = 0;

  function logProgress() {
    const now = Date.now();
    if (now - lastLog < 3000) return;
    lastLog = now;
    console.log(`Progress: ${done + skipped}/${files.length} (${failed} failed, ${skipped} skipped)`);
  }

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= files.length) break;
      const file = files[i];
      const destPath = path.join(DOWNLOAD_DIR, file.path);
      if (fs.existsSync(destPath)) {
        skipped++;
        done++;
        logProgress();
        continue;
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await downloadGDriveFile(file.id, destPath);
          done++;
          logProgress();
          break;
        } catch (e) {
          if (attempt === 2) {
            failed++;
            done++;
            logProgress();
          } else {
            await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
          }
        }
      }
    }
  }

  console.log(`Downloading with ${DL_CONCURRENCY} workers...`);
  const workers = [];
  for (let i = 0; i < DL_CONCURRENCY; i++) workers.push(worker());
  await Promise.all(workers);

  console.log(`Download complete: ${done - skipped - failed} downloaded, ${skipped} skipped, ${failed} failed`);
  return DOWNLOAD_DIR;
}

function scanLocalSprites(spritesDir) {
  const filesByGen = {};
  for (const gen of GENERATIONS) filesByGen[gen] = [];

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else {
        const relPath = path.relative(spritesDir, fullPath).replace(/\\/g, '/');
        const gen = getGenForPath(relPath);
        if (gen) {
          const stat = fs.statSync(fullPath);
          filesByGen[gen].push({ fullPath, relPath, size: stat.size });
        }
      }
    }
  }

  scanDir(spritesDir);
  return filesByGen;
}

async function createZipForGeneration(genName, files) {
  const safeName = genName.replace(/[^a-zA-Z0-9]/g, '_');
  const zipName = safeName + '.zip';
  const zipPath = path.join(outDir, zipName);

  console.log(`[${genName}] ${files.length} files`);

  if (files.length === 0) return [];

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  if (totalSize > MAX_PART_SIZE) {
    console.log(`[${genName}] Splitting (${(totalSize / 1024 / 1024).toFixed(0)} MB)...`);
    return await createSplitZips(genName, files);
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
    for (const file of files) {
      archive.file(file.fullPath, { name: file.relPath });
    }
    archive.finalize();
  });
}

async function createSplitZips(genName, files) {
  const partResults = [];
  let partIndex = 0;
  let currentSize = 0;
  let currentFiles = [];

  for (const file of files) {
    if (currentSize + file.size > MAX_PART_SIZE && currentFiles.length > 0) {
      partResults.push(await writePartZip(genName, currentFiles, partIndex));
      partIndex++;
      currentFiles = [];
      currentSize = 0;
    }
    currentFiles.push(file);
    currentSize += file.size;
  }
  if (currentFiles.length > 0) {
    partResults.push(await writePartZip(genName, currentFiles, partIndex));
  }
  const totalParts = partResults.length;
  for (const p of partResults) p.totalParts = totalParts;
  return partResults;
}

function writePartZip(genName, files, partIndex) {
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
      archive.file(file.fullPath, { name: file.relPath });
    }
    archive.finalize();
  });
}

async function main() {
  let spritesDir;

  if (FROM_DRIVE) {
    spritesDir = await downloadFromDrive();
  } else {
    spritesDir = SPRITES_DIR;
    if (!fs.existsSync(spritesDir)) {
      console.error('Recursos/Sprites not found. Use --from-drive to download from Google Drive.');
      process.exit(1);
    }
  }

  console.log('Scanning sprites...');
  const filesByGen = scanLocalSprites(spritesDir);

  let totalFiles = 0;
  for (const gen of GENERATIONS) totalFiles += filesByGen[gen].length;
  console.log(`Found ${totalFiles} sprite files`);

  const zipManifest = [];

  for (const gen of GENERATIONS) {
    const genFiles = filesByGen[gen];
    if (genFiles.length === 0) {
      console.log(`[${gen}] No files, skipping`);
      continue;
    }
    try {
      const parts = await createZipForGeneration(gen, genFiles);
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
      console.error(`[${gen}] Failed: ${e.message}`);
    }
  }

  const manifestPath = path.join(__dirname, '..', 'sprites-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    version: 1,
    createdAt: new Date().toISOString(),
    totalFiles,
    generations: GENERATIONS.map(g => ({ name: g, fileCount: filesByGen[g].length })),
    zips: zipManifest
  }, null, 2));

  if (FROM_DRIVE && fs.existsSync(DOWNLOAD_DIR)) {
    fs.rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
  }

  console.log(`\nDone! Created ${zipManifest.length} ZIPs in ${outDir}`);
  console.log('Manifest: sprites-manifest.json');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
