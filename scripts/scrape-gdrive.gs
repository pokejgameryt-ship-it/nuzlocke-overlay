// Google Apps Script — Paste into script.google.com → Run → Copy output JSON
// Uses DriveApp (built-in, no API key, no setup needed).
// Lists ALL files recursively in the Sprites folder.

const SPRITES_FOLDER_ID = '1SUAab5By3_apRmmPosfBDpfu7GstHiSA';
const ROOT_FOLDER_ID = '1itRjBo1HfZI_dUCa5PptR3x-OiEXppQI';

function scrapeAllFiles() {
  const files = [];
  const folderQueue = [];
  
  const rootFolder = DriveApp.getFolderById(SPRITES_FOLDER_ID);
  folderQueue.push({ folder: rootFolder, path: '' });
  
  let processed = 0;
  
  while (folderQueue.length > 0) {
    const { folder, path } = folderQueue.shift();
    processed++;
    
    if (processed % 20 === 0) {
      Logger.log('Folders: ' + processed + ' | Files: ' + files.length + ' | Queue: ' + folderQueue.length);
    }
    
    // Get subfolders
    const subfolders = folder.getFolders();
    while (subfolders.hasNext()) {
      const sub = subfolders.next();
      const subPath = path ? path + '/' + sub.getName() : sub.getName();
      folderQueue.push({ folder: sub, path: subPath });
    }
    
    // Get files
    const fileIter = folder.getFiles();
    while (fileIter.hasNext()) {
      const f = fileIter.next();
      const name = f.getName();
      const filePath = path ? path + '/' + name : name;
      files.push({
        id: f.getId(),
        name: name,
        path: filePath
      });
    }
  }
  
  const manifest = {
    version: 1,
    scrapedAt: new Date().toISOString(),
    rootFolderId: ROOT_FOLDER_ID,
    spritesFolderId: SPRITES_FOLDER_ID,
    files: files
  };
  
  Logger.log('DONE — Total files: ' + files.length + ' from ' + processed + ' folders');
  
  // Copy this output from View → Logs
  const json = JSON.stringify(manifest);
  
  // Also save to a file in Google Drive for easy download
  const outputFolder = DriveApp.getRootFolder();
  const blob = Utilities.newBlob(json, 'application/json', 'recursos-manifest.json');
  outputFolder.createFile(blob);
  
  Logger.log('File saved to your Google Drive root: recursos-manifest.json');
  Logger.log('JSON length: ' + json.length + ' chars');
  
  return manifest;
}
