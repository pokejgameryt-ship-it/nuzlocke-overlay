#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { ZipArchive } = require('archiver');

const SPRITES_DIR = path.join(__dirname, '..', 'Recursos', 'Sprites');
const outDir = path.join(__dirname, '..', 'sprites-zips');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const MAX_PART_SIZE = 1.9 * 1024 * 1024 * 1024;

const GENERATIONS = [
  'Gen1', 'Gen2', 'Gen3', 'Gen4', 'Gen5',
  'Gen6', 'Gen7', 'Gen8', 'Gen9', 'LEGENDS ARCEUS'
];

function getGenForPath(relPath) {
  const top = relPath.split(path.sep)[0];
  if (GENERATIONS.includes(top)) return top;
  return null;
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
    const archive = new ZipArchive('zip', { zlib: { level: 6 } });
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
      const r = await writePartZip(genName, currentFiles, partIndex);
      partResults.push(r);
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
    const archive = new ZipArchive('zip', { zlib: { level: 6 } });
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
  console.log('Scanning local sprites...');
  if (!fs.existsSync(SPRITES_DIR)) {
    console.error('Recursos/Sprites not found:', SPRITES_DIR);
    process.exit(1);
  }

  const filesByGen = {};
  for (const gen of GENERATIONS) filesByGen[gen] = [];

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else {
        const relPath = path.relative(SPRITES_DIR, fullPath);
        const gen = getGenForPath(relPath);
        if (gen) {
          const stat = fs.statSync(fullPath);
          filesByGen[gen].push({ fullPath, relPath, size: stat.size });
        }
      }
    }
  }

  scanDir(SPRITES_DIR);

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

  console.log(`\nDone! Created ${zipManifest.length} ZIPs in ${outDir}`);
  console.log('Manifest: sprites-manifest.json');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
