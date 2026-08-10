const fs = require("fs");
const path = require("path");
const Logger = require("./logger");

function detectNamingPattern(files) {
  if (files.length === 0) return "numbered";

  const sample = files.slice(0, 50);

  const hasNamed = sample.some((f) => {
    const base = path.parse(f).name;
    return /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(base) && /\d/.test(base);
  });
  if (hasNamed) return "named";

  const hasPadded = sample.some((f) => {
    const base = path.parse(f).name;
    return /^0+\d+$/.test(base);
  });
  if (hasPadded) return "padded";

  return "numbered";
}

function detectType(files) {
  const exts = new Set(files.map((f) => path.extname(f).toLowerCase()));
  if (exts.has(".gif")) return "animated";
  return "static";
}

function detectGenerations(region) {
  const genMap = {
    Kanto: [1], Gen1: [1],
    Johto: [2], Gen2: [2],
    Hoenn: [3], Gen3: [3],
    Sinnoh: [4], Gen4: [4],
    Teselia: [5], Gen5: [5],
    Kalos: [6], Gen6: [6],
    Alola: [7], Gen7: [7],
    Galar: [8], Gen8: [8],
    Paldea: [9], Gen9: [9],
    "Todas las generaciones": [1, 2, 3, 4, 5, 6, 7, 8, 9],
  };
  return genMap[region] || [];
}

function scanSprites(spritesRoot) {
  const results = [];
  const regionDirs = fs.readdirSync(spritesRoot, { withFileTypes: true }).filter((d) => d.isDirectory());

  for (const regionDir of regionDirs) {
    const regionPath = path.join(spritesRoot, regionDir.name);
    scanDir(regionPath, regionDir.name, regionDir.name, spritesRoot, results);
  }

  return results;
}

function scanDir(dirPath, regionName, displayName, spritesRoot, results) {
  const directFiles = fs.readdirSync(dirPath, { withFileTypes: true }).filter(d => d.isFile()).map(d => d.name);
  const spriteFiles = directFiles.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return [".png", ".gif", ".jpg", ".jpeg", ".webp"].includes(ext);
  });

  if (spriteFiles.length > 0) {
    const relativePath = path.relative(spritesRoot, dirPath).replace(/\\/g, "/");
    const id = buildStyleId(regionName, displayName);
    results.push({
      id,
      name: displayName,
      region: regionName,
      path: relativePath,
      type: detectType(spriteFiles),
      extensions: [...new Set(spriteFiles.map((f) => path.extname(f).toLowerCase()))],
      namingPattern: detectNamingPattern(spriteFiles),
      generations: detectGenerations(regionName),
      fileCount: spriteFiles.length,
    });
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.toLowerCase().includes('shiny')) continue;
    const subPath = path.join(dirPath, entry.name);
    const subDirectFiles = fs.readdirSync(subPath, { withFileTypes: true }).filter(d => d.isFile()).map(d => d.name);
    const subSpriteFiles = subDirectFiles.filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return [".png", ".gif", ".jpg", ".jpeg", ".webp"].includes(ext);
    });
    const childDisplayName = `${displayName} - ${entry.name}`;
    if (subSpriteFiles.length >= 150) {
      scanDir(subPath, regionName, childDisplayName, spritesRoot, results);
    } else if (subSpriteFiles.length === 0) {
      const hasGrandchildren = fs.readdirSync(subPath, { withFileTypes: true }).some(d => d.isDirectory());
      if (hasGrandchildren) {
        scanDir(subPath, regionName, childDisplayName, spritesRoot, results);
      }
    }
  }
}

function collectFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(collectFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }

  return results;
}

function buildStyleId(region, styleName) {
  const slug = (str) =>
    str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  return `${slug(region)}-${slug(styleName)}`;
}

// --- Form name mappings (from parser form strings to filename patterns) ---
const FORM_SUFFIX_MAP = {
  // Regional forms
  'alola':      { named: 'alola',      code: 'RA', number: '1' },
  'alola-f':    { named: 'alola',      code: 'RA', number: '1' },
  'galar':      { named: 'galar',      code: 'RG', number: '2' },
  'galar-f':    { named: 'galar',      code: 'RG', number: '2' },
  'hisui':      { named: 'hisui',      code: 'RH', number: '3' },
  'hisui-f':    { named: 'hisui',      code: 'RH', number: '3' },
  'paldea':     { named: 'paldea',     code: 'RP', number: '4' },
  'paldea-f':   { named: 'paldea',     code: 'RP', number: '4' },
  // Mega / Gmax
  'mega':       { named: 'mega',       code: 'M',  number: null },
  'mega-x':     { named: 'mega-x',     code: 'MX', number: null },
  'mega-y':     { named: 'mega-y',     code: 'MY', number: null },
  'gmax':       { named: 'gmax',       code: 'G',  number: null },
  'gigantamax': { named: 'gigantamax', code: 'G',  number: null },
  // Primal
  'primal':     { named: 'primal',     code: 'P',  number: null },
  // Battle forms
  'attack':     { named: 'attack',     code: 'a',  number: null },
  'defense':    { named: 'defense',    code: 'd',  number: null },
  'speed':      { named: 'speed',      code: 's',  number: null },
  // Other named forms
  'zen':        { named: 'zen',        code: 'z',  number: null },
  'blade':      { named: 'blade',      code: null, number: null },
  'shield':     { named: 'shield',     code: null, number: null },
  'east':       { named: 'east',       code: null, number: null },
  'west':       { named: 'west',       code: null, number: null },
  'sunshine':   { named: 'sunshine',   code: null, number: null },
  'overcast':   { named: 'overcast',   code: null, number: null },
  'rainy':      { named: 'rainy',      code: null, number: null },
  'snowy':      { named: 'snowy',      code: null, number: null },
  'sunny':      { named: 'sunny',      code: null, number: null },
  'school':     { named: 'school',     code: null, number: null },
  'solo':       { named: 'solo',       code: null, number: null },
  'aria':       { named: 'aria',       code: null, number: null },
  'pirouette':  { named: 'pirouette',  code: null, number: null },
  'incarnate':  { named: 'incarnate',  code: null, number: null },
  'therian':    { named: 'therian',    code: null, number: null },
  'resolute':   { named: 'resolute',   code: null, number: null },
  'ordinary':   { named: 'ordinary',   code: null, number: null },
  'black':      { named: 'black',      code: null, number: null },
  'white':      { named: 'white',      code: null, number: null },
  'dusk':       { named: 'dusk',       code: null, number: null },
  'midday':     { named: 'midday',     code: null, number: null },
  'midnight':   { named: 'midnight',   code: null, number: null },
  'ultra':      { named: 'ultra',      code: null, number: null },
  'dawn wings': { named: 'dawn wings', code: null, number: null },
  'dusk mane':  { named: 'dusk mane',  code: null, number: null },
  'origin':     { named: 'origin',     code: null, number: null },
  'altered':    { named: 'altered',    code: null, number: null },
  'neutral':    { named: 'neutral',    code: null, number: null },
  'hero':       { named: 'hero',       code: null, number: null },
  'land':       { named: 'land',       code: null, number: null },
  'sky':        { named: 'sky',        code: null, number: null },
  'noice':      { named: 'noice',      code: null, number: null },
  'antique':    { named: 'antique',    code: null, number: null },
  'phony':      { named: 'phony',      code: null, number: null },
  'average':    { named: 'average',    code: null, number: null },
  'large':      { named: 'large',      code: null, number: null },
  'small':      { named: 'small',      code: null, number: null },
  'super':      { named: 'super',      code: null, number: null },
};

const GENDER_CODE_MAP = { female: 'f', male: 'm', f: 'f', m: 'm' };
const REGION_CODE_MAP = { alola: 'RA', galar: 'RG', hisui: 'RH', paldea: 'RP' };

function resolveSprite(stylePath, speciesId, options = {}) {
  const { form, shiny, gender, spritesRoot, styleId } = options;
  Logger.debug('Sprites', `resolveSprite: speciesId=${speciesId}, stylePath=${stylePath}, styleId=${styleId}`);

  let dir;
  let relativeBase;
  const root = spritesRoot || path.resolve("Recursos", "Sprites");

  if (styleId) {
    const styles = scanSprites(root);
    let match = styles.find(s => s.id === styleId);
    if (!match && stylePath) {
      const lastSegment = stylePath.split('/').pop().split('\\').pop();
      match = styles.find(s => s.name === lastSegment || s.name.startsWith(lastSegment + ' -'));
    }
    if (match) {
      dir = path.join(root, match.path);
      relativeBase = match.path;
    }
  }

  if (!dir) {
    dir = path.isAbsolute(stylePath) ? stylePath : path.join(root, stylePath);
    relativeBase = path.relative(root, dir).replace(/\\/g, "/");
  }

  Logger.debug('Sprites', `  dir=${dir}, relativeBase=${relativeBase}, exists=${fs.existsSync(dir)}`);
  if (!fs.existsSync(dir)) {
    Logger.warn('Sprites', `Style dir NOT found: ${dir}`);
    return null;
  }

  const idStr = String(speciesId);
  const idPadded3 = idStr.padStart(3, '0');
  const idPadded4 = idStr.padStart(4, '0');
  const idBT = 'BT' + idPadded3;
  const exts = [".png", ".gif", ".jpg", ".jpeg", ".webp"];

  // --- Low-level file finders ---
  function fileExists(subdir, basename) {
    const searchDir = subdir ? path.join(dir, subdir) : dir;
    if (!fs.existsSync(searchDir)) return null;
    const files = fs.readdirSync(searchDir);
    const filesLower = new Map(files.map(f => [f.toLowerCase(), f]));
    for (const ext of exts) {
      const key = basename.toLowerCase() + ext;
      if (filesLower.has(key)) {
        const actual = filesLower.get(key);
        const urlPath = subdir ? `${relativeBase}/${subdir}/${actual}` : `${relativeBase}/${actual}`;
        return '/sprites/' + urlPath.replace(/\\/g, "/");
      }
    }
    return null;
  }

  // --- Generate ALL candidate basenames for a given set of params ---
  // IMPORTANT: form-specific candidates MUST come before base IDs to ensure
  // form variants are matched before the base form.
  function allBasenames(id, formSuffix, shinyFlag, genderVal) {
    const c = [];
    const p3 = id.padStart(3, '0');
    const p4 = id.padStart(4, '0');
    const allIds = [id, p3, p4];
    const padIds = [id, p3, p4];

    // Resolve form info
    const formInfo = formSuffix ? (FORM_SUFFIX_MAP[formSuffix.toLowerCase()] || { named: formSuffix }) : null;
    const genderCode = genderVal ? (GENDER_CODE_MAP[genderVal.toLowerCase()] || genderVal.toLowerCase()) : null;

    // --- FORM-SPECIFIC CANDIDATES (must come first) ---

    // Format 1: Hyphen-separated (Global Artworks, Anime HD, Home 3D, 3D Gif Animados)
    if (formInfo && genderCode && shinyFlag) {
      for (const num of allIds) {
        c.push(`${num}-${formInfo.named}-${genderCode}-s`, `${num}-${formInfo.named}-${genderCode}-shiny`);
        c.push(`${num}-${formInfo.named}-s-${genderCode}`, `${num}-${formInfo.named}-shiny-${genderCode}`);
        c.push(`${num}-${formInfo.named}-${genderCode}`);
      }
    }
    if (formInfo && shinyFlag) {
      for (const num of allIds) {
        c.push(`${num}-${formInfo.named}-s`, `${num}-${formInfo.named}-shiny`);
      }
    }
    if (formInfo && genderCode) {
      for (const num of allIds) {
        c.push(`${num}-${formInfo.named}-${genderCode}`);
      }
    }
    if (formInfo) {
      for (const num of allIds) {
        c.push(`${num}-${formInfo.named}`);
      }
    }
    if (genderCode && shinyFlag) {
      for (const num of allIds) {
        c.push(`${num}-${genderCode}-s`, `${num}-${genderCode}-shiny`);
        c.push(`${num}-s-${genderCode}`, `${num}-shiny-${genderCode}`);
        c.push(`${num}-${genderCode}`);
      }
    }
    if (shinyFlag) {
      for (const num of allIds) {
        c.push(`${num}-s`, `${num}-shiny`);
      }
    }
    if (genderCode) {
      for (const num of allIds) {
        c.push(`${num}-${genderCode}`);
      }
    }

    // Format 2: Underscore-separated (SPRITES ANIMADOS)
    if (formInfo && formInfo.code) {
      if (genderCode && shinyFlag) {
        padIds.forEach(n => { c.push(`${n}_${formInfo.code}_${genderCode}_s`, `${n}_${formInfo.code}_${genderCode}s`); });
      }
      if (shinyFlag) {
        padIds.forEach(n => { c.push(`${n}_${formInfo.code}_s`, `${n}_${formInfo.code}s`); });
      }
      if (genderCode) {
        padIds.forEach(n => c.push(`${n}_${formInfo.code}_${genderCode}`));
      }
      padIds.forEach(n => c.push(`${n}_${formInfo.code}`));
    }
    // Underscore gender/shiny on bare id (form-specific)
    if (genderCode && shinyFlag) {
      c.push(`${id}_${genderCode}_s`, `${id}_${genderCode}s`, `${id}_s_${genderCode}`);
      c.push(`${p3}_${genderCode}_s`, `${p3}_${genderCode}s`);
    }
    if (shinyFlag) {
      c.push(`${id}_s`, `${p3}_s`);
    }
    if (genderCode) {
      c.push(`${id}_${genderCode}`, `${p3}_${genderCode}`);
    }

    // Format 3: Appended to number (RSE, Unown, HGSS Notched Pichu)
    if (formInfo && formInfo.named && formInfo.named.length <= 3) {
      if (shinyFlag) {
        c.push(`${id}${formInfo.named}s`, `${id}${formInfo.named}shiny`);
        c.push(`${p3}${formInfo.named}s`, `${p3}${formInfo.named}shiny`);
      }
      c.push(`${id}${formInfo.named}`, `${p3}${formInfo.named}`);
    }
    if (shinyFlag) {
      c.push(`${id}s`, `${p3}s`);
    }

    // Format 5: Home 3D numbered forms ({id}-{N}, {id}-{N}-female, {id}-{N}-gmax)
    if (formInfo && formInfo.number) {
      if (genderCode && shinyFlag) {
        for (const num of allIds) {
          c.push(`${num}-${formInfo.number}-${genderCode}-s`, `${num}-${formInfo.number}-${genderCode}-shiny`, `${num}-${formInfo.number}-${genderCode}`);
        }
      }
      if (shinyFlag) {
        for (const num of allIds) {
          c.push(`${num}-${formInfo.number}-s`, `${num}-${formInfo.number}-shiny`);
        }
      }
      if (genderCode) {
        for (const num of allIds) {
          c.push(`${num}-${formInfo.number}-${genderCode}`);
        }
      }
      for (const num of allIds) {
        c.push(`${num}-${formInfo.number}`);
      }
    }

    // Format 7: BT prefix (Battle Trozei)
    if (genderCode && shinyFlag) {
      c.push(`${idBT}-${genderCode}-s`, `${idBT}-${genderCode}-shiny`);
    }
    if (shinyFlag) {
      c.push(`${idBT}-s`, `${idBT}-shiny`);
    }
    if (genderCode) {
      c.push(`${idBT}-${genderCode}`);
    }
    if (formInfo) {
      c.push(`${idBT}-${formInfo.named}`);
    }
    c.push(idBT);

    // --- BASE IDS (must come LAST so form-specific candidates are tried first) ---
    for (const num of allIds) {
      c.push(num);
    }

    return c;
  }

  // --- Find the best fuzzy match for a file list ---
  function fuzzyFind(searchDir, relBase, numStr, formSuffix, shinyFlag, genderVal) {
    if (!fs.existsSync(searchDir)) return null;
    const files = fs.readdirSync(searchDir);
    const formInfo = formSuffix ? (FORM_SUFFIX_MAP[formSuffix.toLowerCase()] || { named: formSuffix }) : null;
    const genderCode = genderVal ? (GENDER_CODE_MAP[genderVal.toLowerCase()] || genderVal.toLowerCase()) : null;

    let bestMatch = null;
    let bestScore = -Infinity;

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!exts.includes(ext)) continue;
      const base = path.basename(file, ext);
      const baseLower = base.toLowerCase();
      const baseUpper = base.toUpperCase();
      let score = 0;

      // Exact ID match (various paddings)
      if (base === numStr || base === numStr.padStart(3, '0') || base === numStr.padStart(4, '0')) {
        score = 1000;
      }
      // BT prefix match
      else if (baseUpper.startsWith('BT' + numStr.padStart(3, '0'))) {
        score = 900;
      }
      // Starts with padded ID followed by separator
      else if (/^\d+[-_. ]/.test(base)) {
        const matchNum = base.match(/^0*(\d+)/);
        if (matchNum && matchNum[1] === numStr) {
          score = 800;
          // Form match: require word boundary (not substring like "alolacap" for "alola")
          if (formInfo && formInfo.named) {
            const namedLower = formInfo.named.toLowerCase();
            // Also check alternate form names (gmax <-> gigantamax)
            const altNames = { gmax: 'gigantamax', gigantamax: 'gmax', 'mega-x': ['mega x', 'mega-x'], 'mega-y': ['mega y', 'mega-y'] };
            const namesToCheck = [namedLower];
            if (altNames[namedLower]) {
              const alt = altNames[namedLower];
              if (Array.isArray(alt)) namesToCheck.push(...alt);
              else namesToCheck.push(alt);
            }
            const matchesForm = namesToCheck.some(name => {
              // Exact match
              if (baseLower === name) return true;
              // Word-boundary match: name appears as a complete segment separated by - _ . or space
              const wordBoundaryRegex = new RegExp('(?:^|[-_.\\s])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[-_.\\s]|$)', 'i');
              return wordBoundaryRegex.test(baseLower);
            });
            if (matchesForm) score += 50;
          } else if (!formInfo) {
            // No form requested: penalize files with known form keywords
            const formKeywords = ['alola', 'galar', 'hisui', 'paldea', 'mega', 'gmax', 'gigantamax',
              'attack', 'defense', 'speed', 'zen', 'blade', 'shield', 'east', 'west',
              'sunshine', 'overcast', 'rainy', 'snowy', 'sunny', 'school', 'solo',
              'aria', 'pirouette', 'incarnate', 'therian', 'resolute', 'ordinary',
              'black', 'white', 'dusk', 'midday', 'midnight', 'ultra', 'origin',
              'altered', 'neutral', 'hero', 'land', 'sky', 'noice', 'antique', 'phony',
              'average', 'large', 'small', 'super', 'nosparks', 'cap'];
            const hasFormKeyword = formKeywords.some(kw => {
              const wordBoundaryRegex = new RegExp('(?:^|[-_.\\s])' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[-_.\\s]|$)', 'i');
              return wordBoundaryRegex.test(baseLower);
            });
            if (hasFormKeyword) score -= 200;
          }
          if (formInfo && formInfo.code && base.includes(formInfo.code)) score += 50;
          // Gender bonus: check for -f, -female, _f, _female at end or before shiny suffix
          if (genderCode) {
            const genderPatterns = ['-' + genderCode, '-female', '_' + genderCode, '_female'];
            if (genderPatterns.some(p => baseLower.endsWith(p)) || genderPatterns.some(p => baseLower.includes(p + '-s'))) score += 40;
          }
          if (!shinyFlag && (baseLower.endsWith('-s') || baseLower.endsWith('-shiny') || baseLower.endsWith('_s'))) score -= 200;
          if (shinyFlag && (baseLower.endsWith('-s') || baseLower.endsWith('-shiny') || baseLower.endsWith('_s') || baseLower.endsWith('s'))) score += 20;
        }
      }
      // Starts with numeric ID directly (no separator, like RSE: 351fire.png)
      else if (/^0*\d+[a-z]/.test(baseLower)) {
        const matchNum = baseLower.match(/^(0*\d+)/);
        if (matchNum && matchNum[1].replace(/^0+/, '') === numStr) {
          score = 700;
          if (formInfo && formInfo.named) {
            const namedLower = formInfo.named.toLowerCase();
            if (baseLower.endsWith(namedLower) || baseLower.includes(namedLower + 'back')) score += 50;
          }
          // Only penalize standalone 's' suffix (not form names like "attack", "speed")
          if (!shinyFlag && /s$/.test(baseLower) && !/attack|defense|speed|shield|incarnate|therian/.test(baseLower)) score -= 200;
          if (shinyFlag && /s$/.test(baseLower)) score += 20;
        }
      }
      // Sugimori style: "0025 Pikachu Alola" (space-separated)
      else if (/^\d+\s+[A-Z]/.test(base)) {
        const matchNum = base.match(/^0*(\d+)/);
        if (matchNum && matchNum[1] === numStr) {
          score = 600;
          if (formInfo && formInfo.named) {
            const namedLower = formInfo.named.toLowerCase();
            // Word-boundary match for Sugimori style
            const words = baseLower.split(/\s+/);
            if (words.some(w => w === namedLower)) score += 80;
          }
          if (genderCode && baseLower.includes(genderCode)) score += 30;
          if (shinyFlag && baseLower.includes('shiny')) score += 20;
          if (!shinyFlag && baseLower.includes('shiny')) score -= 300;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = file;
      }
    }

    if (bestMatch && bestScore > 0) {
      const urlPath = relBase ? `${relBase}/${bestMatch}` : `${bestMatch}`;
      return '/sprites/' + urlPath.replace(/\\/g, "/");
    }
    return null;
  }

  // --- Search for shiny in subdirectories ---
  function findInShinyDirs() {
    const styleBaseName = path.basename(dir).toLowerCase();
    const dirsToCheck = [dir];
    const parentDir = path.dirname(dir);
    if (parentDir !== dir && fs.existsSync(parentDir)) {
      dirsToCheck.push(parentDir);
    }

    for (const checkDir of dirsToCheck) {
      if (!fs.existsSync(checkDir)) continue;
      const allEntries = fs.readdirSync(checkDir, { withFileTypes: true });
      const shinyDirs = allEntries.filter(e => e.isDirectory() && e.name.toLowerCase().includes('shiny'));

      // Prefer shiny dir matching current style name
      const matching = shinyDirs.filter(e => {
        const n = e.name.toLowerCase();
        return n.includes(styleBaseName) || styleBaseName.includes(n.replace('shiny', '').trim());
      });
      const toCheck = [...matching, ...shinyDirs.filter(e => !matching.includes(e))];

      for (const entry of toCheck) {
        const shinyDir = path.join(checkDir, entry.name);
        const shinyRelBase = path.relative(root, shinyDir).replace(/\\/g, "/");

        // Try exact candidates first
        const candidates = allBasenames(idStr, form, false, gender);
        for (const c of candidates) {
          const found = fileExistsInDir(shinyDir, shinyRelBase, c);
          if (found) return found;
        }

        // Then fuzzy
        const fuzzy = fuzzyFind(shinyDir, shinyRelBase, idStr, form, false, gender);
        if (fuzzy) return fuzzy;
      }
    }
    return null;
  }

  function fileExistsInDir(absDir, relBase, basename) {
    if (!fs.existsSync(absDir)) return null;
    const files = fs.readdirSync(absDir);
    const filesLower = new Map(files.map(f => [f.toLowerCase(), f]));
    for (const ext of exts) {
      const key = basename.toLowerCase() + ext;
      if (filesLower.has(key)) {
        const actual = filesLower.get(key);
        return '/sprites/' + (relBase + '/' + actual).replace(/\\/g, "/");
      }
    }
    return null;
  }

  // --- Main resolution logic ---

  // 1. If shiny requested, search shiny subdirs first
  if (shiny) {
    const shinyResult = findInShinyDirs();
    if (shinyResult) return shinyResult;
  }

  // 2. Try exact candidates in main dir
  const candidates = allBasenames(idStr, form, shiny, gender);
  for (const c of candidates) {
    const found = fileExists(null, c);
    if (found) return found;
  }

  // 3. Fuzzy match in main dir
  const fuzzyResult = fuzzyFind(dir, relativeBase, idStr, form, shiny, gender);
  if (fuzzyResult) return fuzzyResult;

  // 4. Check named subdirectories (Unown, Castform, Deoxys, etc.)
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.toLowerCase().includes('shiny')) continue;

    const subCandidates = allBasenames(idStr, form, shiny, gender);
    for (const c of subCandidates) {
      const found = fileExists(entry.name, c);
      if (found) return found;
    }
    const subFuzzy = fuzzyFind(path.join(dir, entry.name), `${relativeBase}/${entry.name}`, idStr, form, shiny, gender);
    if (subFuzzy) return subFuzzy;
  }

  // 5. Last resort: try base form (no form/gender/shiny) with fuzzy
  if (form || shiny || gender) {
    const baseCandidates = allBasenames(idStr, null, false, null);
    for (const c of baseCandidates) {
      const found = fileExists(null, c);
      if (found) return found;
    }
    const baseFuzzy = fuzzyFind(dir, relativeBase, idStr, null, false, null);
    if (baseFuzzy) return baseFuzzy;
  }

  Logger.warn('Sprites', `No sprite found for species ${speciesId} in ${dir}`);
  return null;
}

module.exports = { scanSprites, resolveSprite, detectNamingPattern };
