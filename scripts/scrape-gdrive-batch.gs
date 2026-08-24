// Google Apps Script — Process ONE folder at a time to avoid timeout.
// Change FOLDER_NAME below to: Gen1, Gen2, Gen3, Gen4, Gen5, Gen6, Gen7, Gen8, Gen9, LEGENDS ARCEUS
// Run once per folder. Each generates a JSON file in Google Drive.

const FOLDER_NAME = 'Gen1'; // <-- CHANGE THIS for each run
const SPRITES_FOLDER_ID = '1SUAab5By3_apRmmPosfBDpfu7GstHiSA';
const ROOT_FOLDER_ID = '1itRjBo1HfZI_dUCa5PptR3x-OiEXppQI';

function scrapeFolder() {
  const spritesRoot = DriveApp.getFolderById(SPRITES_FOLDER_ID);
  
  // Find the target subfolder
  const subfolders = spritesRoot.getFolders();
  let targetFolder = null;
  while (subfolders.hasNext()) {
    const f = subfolders.next();
    if (f.getName() === FOLDER_NAME) {
      targetFolder = f;
      break;
    }
  }
  
  if (!targetFolder) {
    Logger.log('Folder not found: ' + FOLDER_NAME);
    return;
  }
  
  const files = [];
  const folderQueue = [{ folder: targetFolder, path: FOLDER_NAME }];
  let processed = 0;
  
  while (folderQueue.length > 0) {
    const item = folderQueue.shift();
    const folder = item.folder;
    const currentPath = item.path;
    processed++;
    
    if (processed % 10 === 0) {
      Logger.log('Folders: ' + processed + ' | Files: ' + files.length + ' | Queue: ' + folderQueue.length);
    }
    
    // Get subfolders
    const subs = folder.getFolders();
    while (subs.hasNext()) {
      const sub = subs.next();
      folderQueue.push({ folder: sub, path: currentPath + '/' + sub.getName() });
    }
    
    // Get files
    const fileIter = folder.getFiles();
    while (fileIter.hasNext()) {
      const f = fileIter.next();
      files.push({ id: f.getId(), name: f.getName(), path: currentPath + '/' + f.getName() });
    }
  }
  
  Logger.log('DONE — ' + FOLDER_NAME + ': ' + files.length + ' files from ' + processed + ' folders');
  
  // Save as JSON file in Drive root
  const manifest = {
    folder: FOLDER_NAME,
    files: files
  };
  
  const json = JSON.stringify(manifest);
  const blob = Utilities.newBlob(json, 'application/json', 'manifest-' + FOLDER_NAME + '.json');
  DriveApp.getRootFolder().createFile(blob);
  
  Logger.log('Saved: manifest-' + FOLDER_NAME + '.json to your Google Drive');
  Logger.log('JSON size: ' + (json.length / 1024 / 1024).toFixed(2) + ' MB');
  
  return manifest;
}
