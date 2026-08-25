// ===================================================
// Google Apps Script — Genera ZIPs de sprites en el servidor de Google
// Ejecutar en: script.google.com
// NO descarga nada localmente — todo ocurre en la nube de Google
// ===================================================

const SPRITES_FOLDER_ID = '1SUAab5By3_apRmmPosfBDpfu7GstHiSA';
const GENERATIONS = ['Gen1', 'Gen2', 'Gen3', 'Gen4', 'Gen5', 'Gen6', 'Gen7', 'Gen8', 'Gen9', 'LEGENDS ARCEUS'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Sprites ZIP Generator')
    .addItem('Generate ZIPs', 'generateAllZips')
    .addItem('Test Access', 'testAccess')
    .addToUi();
}

function testAccess() {
  const root = DriveApp.getFolderById(SPRITES_FOLDER_ID);
  Logger.log('Root folder: ' + root.getName());
  
  const subfolders = root.getFolders();
  while (subfolders.hasNext()) {
    const sub = subfolders.next();
    Logger.log('  ' + sub.getName() + ' (id: ' + sub.getId() + ')');
    
    // Count files in subfolder
    let fileCount = 0;
    const files = sub.getFiles();
    while (files.hasNext()) {
      files.next();
      fileCount++;
    }
    Logger.log('    Files: ' + fileCount);
  }
}

function generateAllZips() {
  const root = DriveApp.getFolderById(SPRITES_FOLDER_ID);
  const results = [];
  
  for (const gen of GENERATIONS) {
    Logger.log('=== Processing ' + gen + ' ===');
    
    // Find the generation folder
    const genFolders = root.getFoldersByName(gen);
    if (!genFolders.hasNext()) {
      Logger.log(gen + ' folder not found, skipping');
      continue;
    }
    const genFolder = genFolders.next();
    
    // Collect ALL files recursively
    const allFiles = [];
    collectAllFiles(genFolder, '', allFiles);
    Logger.log(gen + ': ' + allFiles.length + ' files found');
    
    if (allFiles.length === 0) continue;
    
    // Split into chunks of 500 files ( Apps Script has memory limits)
    const CHUNK_SIZE = 500;
    const chunks = [];
    for (let i = 0; i < allFiles.length; i += CHUNK_SIZE) {
      chunks.push(allFiles.slice(i, i + CHUNK_SIZE));
    }
    
    Logger.log(gen + ': Split into ' + chunks.length + ' chunks of ~' + CHUNK_SIZE + ' files');
    
    // Create a subfolder for this generation's ZIPs
    let genZipFolder;
    const existingFolders = root.getFoldersByName(gen + '_ZIPs');
    if (existingFolders.hasNext()) {
      genZipFolder = existingFolders.next();
    } else {
      genZipFolder = root.createFolder(gen + '_ZIPs');
    }
    
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const partName = chunks.length > 1 
        ? gen.replace(/[^a-zA-Z0-9]/g, '_') + '_part' + (ci + 1) + '.zip'
        : gen.replace(/[^a-zA-Z0-9]/g, '_') + '.zip';
      
      // Check if already exists
      const existing = genZipFolder.getFilesByName(partName);
      if (existing.hasNext()) {
        Logger.log(partName + ' already exists, skipping');
        continue;
      }
      
      Logger.log('Creating ' + partName + ' (' + chunk.length + ' files)...');
      
      try {
        const zipBlob = createZipBlob(chunk, partName);
        if (zipBlob) {
          genZipFolder.createFile(zipBlob);
          const sizeMB = (zipBlob.getBytes().length / 1024 / 1024).toFixed(1);
          Logger.log('Created ' + partName + ' (' + sizeMB + ' MB)');
          results.push({ name: partName, gen: gen, files: chunk.length, size: sizeMB + ' MB' });
        }
      } catch (e) {
        Logger.log('Error creating ' + partName + ': ' + e.message);
      }
    }
  }
  
  Logger.log('\n=== ALL DONE ===');
  results.forEach(r => Logger.log(r.name + ': ' + r.files + ' files, ' + r.size));
  
  SpreadsheetApp.getUi().alert(
    'ZIP generation complete!\n\n' +
    results.map(r => r.name + ': ' + r.files + ' files, ' + r.size).join('\n') +
    '\n\nZIPs are in the "Sprite_ZIPs" folder in your Google Drive root.'
  );
}

function collectAllFiles(folder, prefix, files) {
  const fileIter = folder.getFiles();
  while (fileIter.hasNext()) {
    const f = fileIter.next();
    files.push({
      id: f.getId(),
      name: f.getName(),
      path: prefix + f.getName()
    });
  }
  
  const subIter = folder.getFolders();
  while (subIter.hasNext()) {
    const sub = subIter.next();
    collectAllFiles(sub, prefix + sub.getName() + '/', files);
  }
}

function createZipBlob(files, zipName) {
  // Create ZIP file manually using the ZIP format specification
  // This avoids needing external libraries
  
  const localHeaders = [];
  const dataBuffers = [];
  let offset = 0;
  
  for (const file of files) {
    try {
      const blob = DriveApp.getFileById(file.id).getBlob();
      const data = blob.getBytes();
      
      // Local file header (30 bytes + name)
      const nameBytes = Utilities.newBlob(file.path).getBytes();
      const header = new ArrayBuffer(30 + nameBytes.length);
      const hView = new DataView(header);
      
      hView.setUint32(0, 0x04034b50, true);  // Local file header signature
      hView.setUint16(4, 20, true);            // Version needed to extract
      hView.setUint16(6, 0, true);             // General purpose bit flag
      hView.setUint16(8, 0, true);             // Compression method (stored)
      hView.setUint16(10, 0, true);            // Last mod file time
      hView.setUint16(12, 0, true);            // Last mod file date
      hView.setUint32(14, crc32(data), true);  // CRC-32
      hView.setUint32(18, data.length, true);  // Compressed size
      hView.setUint32(22, data.length, true);  // Uncompressed size
      hView.setUint16(26, nameBytes.length, true); // File name length
      hView.setUint16(28, 0, true);            // Extra field length
      
      new Uint8Array(header).set(nameBytes, 30);
      
      localHeaders.push({ header: new Uint8Array(header), data: data, path: file.path, crc: crc32(data), size: data.length });
      offset += header.byteLength + data.length;
    } catch (e) {
      Logger.log('  Skip ' + file.name + ': ' + e.message);
    }
  }
  
  if (localHeaders.length === 0) return null;
  
  // Build central directory
  const centralDir = [];
  let cdOffset = 0;
  
  for (const entry of localHeaders) {
    const nameBytes = Utilities.newBlob(entry.path).getBytes();
    const cdEntry = new ArrayBuffer(46 + nameBytes.length);
    const cdView = new DataView(cdEntry);
    
    cdView.setUint32(0, 0x02014b50, true);    // Central directory signature
    cdView.setUint16(4, 20, true);              // Version made by
    cdView.setUint16(6, 20, true);              // Version needed to extract
    cdView.setUint16(8, 0, true);               // General purpose bit flag
    cdView.setUint16(10, 0, true);              // Compression method
    cdView.setUint16(12, 0, true);              // Last mod file time
    cdView.setUint16(14, 0, true);              // Last mod file date
    cdView.setUint32(16, entry.crc, true);      // CRC-32
    cdView.setUint32(20, entry.size, true);     // Compressed size
    cdView.setUint32(24, entry.size, true);     // Uncompressed size
    cdView.setUint16(28, nameBytes.length, true); // File name length
    cdView.setUint16(30, 0, true);              // Extra field length
    cdView.setUint16(32, 0, true);              // File comment length
    cdView.setUint16(34, 0, true);              // Disk number start
    cdView.setUint16(36, 0, true);              // Internal file attributes
    cdView.setUint32(38, 0, true);              // External file attributes
    cdView.setUint32(42, cdOffset, true);       // Relative offset of local header
    
    new Uint8Array(cdEntry).set(nameBytes, 46);
    centralDir.push({ entry: new Uint8Array(cdEntry), path: entry.path });
    cdOffset += cdEntry.byteLength + entry.size + 30 + nameBytes.length;
  }
  
  // End of central directory
  const cdSize = centralDir.reduce((sum, e) => sum + e.entry.byteLength, 0);
  const eocd = new ArrayBuffer(22);
  const eocdView = new DataView(eocd);
  
  eocdView.setUint32(0, 0x06054b50, true);     // End of central directory signature
  eocdView.setUint16(4, 0, true);                // Number of this disk
  eocdView.setUint16(6, 0, true);                // Disk where central directory starts
  eocdView.setUint16(8, localHeaders.length, true); // Number of central directory records on this disk
  eocdView.setUint16(10, localHeaders.length, true); // Total number of central directory records
  eocdView.setUint32(12, cdSize, true);          // Size of central directory
  eocdView.setUint32(16, offset, true);          // Offset of start of central directory
  eocdView.setUint16(20, 0, true);               // Comment length
  
  // Combine everything
  const totalSize = offset + cdSize + 22;
  const result = new Uint8Array(totalSize);
  let pos = 0;
  
  for (const entry of localHeaders) {
    result.set(entry.header, pos);
    pos += entry.header.byteLength;
    result.set(entry.data, pos);
    pos += entry.data.length;
  }
  
  for (const cd of centralDir) {
    result.set(cd.entry, pos);
    pos += cd.entry.byteLength;
  }
  
  result.set(new Uint8Array(eocd), pos);
  
  return Utilities.newBlob(result, 'application/zip', zipName);
}

// CRC-32 lookup table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
