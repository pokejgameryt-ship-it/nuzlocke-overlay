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
  const lower = region.toLowerCase();
  const genMap = {
    kanto: [1], gen1: [1],
    johto: [2], gen2: [2],
    hoenn: [3], gen3: [3],
    sinnoh: [4], gen4: [4],
    teselia: [5], gen5: [5],
    kalos: [6], gen6: [6],
    alola: [7], gen7: [7],
    galar: [8], gen8: [8],
    paldea: [9], gen9: [9],
    "todas las generaciones": [1, 2, 3, 4, 5, 6, 7, 8, 9],
    "legends arceus": [10],
  };
  return genMap[lower] || [];
}

let _cachedStyles = null;
let _cachedSpritesRoot = null;

function scanSprites(spritesRoot) {
  if (_cachedStyles && _cachedSpritesRoot === spritesRoot) {
    return _cachedStyles;
  }

  if (!fs.existsSync(spritesRoot)) {
    Logger.warn('Sprites', `Sprites directory not found: ${spritesRoot}`);
    _cachedStyles = [];
    _cachedSpritesRoot = spritesRoot;
    return [];
  }

  const results = [];
  const regionDirs = fs.readdirSync(spritesRoot, { withFileTypes: true }).filter((d) => d.isDirectory());

  for (const regionDir of regionDirs) {
    const regionPath = path.join(spritesRoot, regionDir.name);
    scanDir(regionPath, regionDir.name, regionDir.name, spritesRoot, results);
  }

  _cachedStyles = results;
  _cachedSpritesRoot = spritesRoot;
  Logger.info('Sprites', `Scanned ${results.length} styles from ${spritesRoot}`);
  return results;
}

function invalidateStyleCache() {
  _cachedStyles = null;
  _cachedSpritesRoot = null;
}

const GENDER_DIR_NAMES = ['male', 'female', 'macho', 'hembra'];

function isGenderDir(name) {
  return GENDER_DIR_NAMES.includes(name.toLowerCase());
}

// Detect if a directory name contains a gender word and extract the base name
// e.g., "Male Frame 1" -> { gender: "male", base: "Frame 1" }
// e.g., "Female Shiny" -> { gender: "female", base: "Shiny" }
// e.g., "Back Male Sprites" -> { gender: "male", base: "Back Sprites" }
function parseGenderDirName(name) {
  const genderPatterns = [
    /^(male|female|macho|hembra)\s+(.+)/i,  // "Male Frame 1"
    /^(.+)\s+(male|female|macho|hembra)\s*(.*)/i,  // "Back Male Sprites", "Shiny Male Frame 1"
  ];
  for (const regex of genderPatterns) {
    const match = name.match(regex);
    if (match) {
      let gender, base;
      if (GENDER_DIR_NAMES.includes(match[1].toLowerCase())) {
        gender = match[1].toLowerCase() === 'macho' ? 'male' : match[1].toLowerCase() === 'hembra' ? 'female' : match[1].toLowerCase();
        base = match[2].trim();
        if (match[3]) base += ' ' + match[3].trim();
      } else if (match[2] && GENDER_DIR_NAMES.includes(match[2].toLowerCase())) {
        gender = match[2].toLowerCase() === 'macho' ? 'male' : match[2].toLowerCase() === 'hembra' ? 'female' : match[2].toLowerCase();
        base = match[1].trim();
        if (match[3]) base += ' ' + match[3].trim();
      } else {
        continue;
      }
      // Clean up base name
      base = base.replace(/\s+/g, ' ').trim();
      if (base.length === 0) base = 'default';
      return { gender: gender === 'macho' ? 'male' : gender === 'hembra' ? 'female' : gender, base };
    }
  }
  return null;
}

function countSpriteFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isFile())
    .filter(d => ['.png', '.gif', '.jpg', '.jpeg', '.webp'].includes(path.extname(d.name).toLowerCase()))
    .length;
}

function scanDir(dirPath, regionName, displayName, spritesRoot, results, skipGenderMerging) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const directFiles = entries.filter(d => d.isFile()).map(d => d.name);
  const spriteFiles = directFiles.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return [".png", ".gif", ".jpg", ".jpeg", ".webp"].includes(ext);
  });

  const subdirs = entries.filter(d => d.isDirectory());

  // Separate gender dirs, variant dirs, and style dirs
  const genderGroups = {};
  const variantDirs = [];
  const styleDirs = [];

  const VARIANT_NAMES = [
    'shiny', 'animated', 'forms', 'alternate versions',
    'icon', 'icons', 'portraits', 'trainers', 'eggs',
  ];

  function isVariantDir(name) {
    const lower = name.toLowerCase();
    return VARIANT_NAMES.some(v => lower === v || lower.startsWith(v + ' '));
  }

  for (const entry of subdirs) {
    const lower = entry.name.toLowerCase();
    // Shiny dirs are always variants
    if (lower.includes('shiny')) {
      variantDirs.push(entry);
      continue;
    }
    // Gender dirs
    if (isGenderDir(entry.name)) {
      const key = lower === 'male' || lower === 'macho' ? 'male' : 'female';
      const baseKey = '_exact';
      if (!genderGroups[baseKey]) genderGroups[baseKey] = {};
      genderGroups[baseKey][key] = path.join(dirPath, entry.name);
      continue;
    }
    const parsed = parseGenderDirName(entry.name);
    if (parsed) {
      if (!genderGroups[parsed.base]) genderGroups[parsed.base] = {};
      genderGroups[parsed.base][parsed.gender] = path.join(dirPath, entry.name);
      continue;
    }
    // Variant dirs (back, animated, forms, etc.)
    if (isVariantDir(entry.name)) {
      variantDirs.push(entry);
      continue;
    }
    // Everything else is a potential style dir
    styleDirs.push(entry);
  }

  // Count all files: direct + variant subdirs (skip shiny - always separate)
  let allSpriteFiles = [...spriteFiles];
  let variantSourcePath = null;
  for (const vDir of variantDirs) {
    if (vDir.name.toLowerCase().includes('shiny')) continue;
    const vPath = path.join(dirPath, vDir.name);
    const vFiles = fs.readdirSync(vPath, { withFileTypes: true })
      .filter(d => d.isFile())
      .map(d => d.name)
      .filter(f => {
        const ext = path.extname(f).toLowerCase();
        return [".png", ".gif", ".jpg", ".jpeg", ".webp"].includes(ext);
      });
    allSpriteFiles.push(...vFiles);
  }

  // Process gender groups
  // When parent has direct files, don't create gender-merged styles separately.
  // Instead, attach genderDirs to the parent style and let the resolver handle it.
  let hasGenderGroups = Object.keys(genderGroups).length > 0;

  // If parent has no direct files but has gender groups, create gender-merged styles
  if (spriteFiles.length === 0 && hasGenderGroups) {
    const groupKeys = Object.keys(genderGroups);
    for (const [baseKey, genderPaths] of Object.entries(genderGroups)) {
      const maleCount = countSpriteFiles(genderPaths.male || '');
      const femaleCount = countSpriteFiles(genderPaths.female || '');
      const totalCount = maleCount + femaleCount + allSpriteFiles.length;
      if (totalCount === 0) continue;

      // When multiple gender groups exist, always include the base key in the name
      // to avoid duplicate names (e.g., "Gen4 - HGSS - Female", "Gen4 - HGSS - Male")
      let groupDisplayName;
      if (baseKey === '_exact' && groupKeys.length === 1) {
        groupDisplayName = displayName;
      } else {
        groupDisplayName = `${displayName} - ${baseKey}`;
      }

      const id = buildStyleId(regionName, groupDisplayName);
      const allExts = new Set();
      const allNaming = [];

      allSpriteFiles.forEach(f => {
        allExts.add(path.extname(f).toLowerCase());
        allNaming.push(f);
      });

      for (const [, gDir] of Object.entries(genderPaths)) {
        if (!gDir || !fs.existsSync(gDir)) continue;
        const files = fs.readdirSync(gDir).filter(f => {
          const ext = path.extname(f).toLowerCase();
          return ['.png', '.gif', '.jpg', '.jpeg', '.webp'].includes(ext);
        });
        files.forEach(f => allExts.add(path.extname(f).toLowerCase()));
        allNaming.push(...files);
      }

      let stylePath = path.relative(spritesRoot, dirPath).replace(/\\/g, "/");
      for (const [, gDir] of Object.entries(genderPaths)) {
        if (gDir && fs.existsSync(gDir) && countSpriteFiles(gDir) > 0) {
          stylePath = path.relative(spritesRoot, gDir).replace(/\\/g, "/");
          break;
        }
      }

      const gdrp = {};
      for (const [key, gDir] of Object.entries(genderPaths)) {
        if (gDir && fs.existsSync(gDir)) {
          gdrp[key] = path.relative(spritesRoot, gDir).replace(/\\/g, "/");
        }
      }

      results.push({
        id,
        name: groupDisplayName,
        region: regionName,
        path: stylePath,
        type: detectType([...allExts].map(e => 'file' + e)),
        extensions: [...allExts],
        namingPattern: detectNamingPattern(allNaming),
        generations: detectGenerations(regionName),
        fileCount: totalCount,
        genderDirs: gdrp,
      });
    }
  }

  // Process style subdirectories (non-variant, non-gender)
  for (const entry of styleDirs) {
    const subPath = path.join(dirPath, entry.name);
    const hasGrandchildren = fs.readdirSync(subPath, { withFileTypes: true }).some(d => d.isDirectory());
    const subFiles = fs.readdirSync(subPath, { withFileTypes: true })
      .filter(d => d.isFile())
      .map(d => d.name)
      .filter(f => {
        const ext = path.extname(f).toLowerCase();
        return [".png", ".gif", ".jpg", ".jpeg", ".webp"].includes(ext);
      });

    // If subdirectory has <51 files and no grandchildren, treat as variant (merge into parent)
    // A complete Pokemon set is ~50 files, so <=50 means it's a form-specific subset
    if (subFiles.length < 51 && !hasGrandchildren) {
      allSpriteFiles.push(...subFiles);
      if (!variantSourcePath) {
        variantSourcePath = path.relative(spritesRoot, subPath).replace(/\\/g, "/");
      }
      continue;
    }

    if (subFiles.length > 0 || hasGrandchildren) {
      const childDisplayName = `${displayName} - ${entry.name}`;
      // Check if this subdir's only subdirectories are gender dirs (female/male)
      // If so, don't recurse — the parent already has genderDirs set
      const subEntries = fs.readdirSync(subPath, { withFileTypes: true }).filter(d => d.isDirectory());
      const genderSubEntries = subEntries.filter(d => {
        const n = d.name.toLowerCase();
        return n === 'female' || n === 'male' || n === 'macho' || n === 'hembra'
          || parseGenderDirName(d.name) !== null;
      });
      const skipRecurse = subEntries.length > 0 && genderSubEntries.length === subEntries.length;
      if (skipRecurse) {
        // Don't recurse — this subdir is a parent of gender variants only
        // Merge its files into the parent as a variant
        allSpriteFiles.push(...subFiles);
        if (!variantSourcePath) {
          variantSourcePath = path.relative(spritesRoot, subPath).replace(/\\/g, "/");
        }
        continue;
      }
      scanDir(subPath, regionName, childDisplayName, spritesRoot, results);
    }
  }

  // Create style from direct + variant files (always, even if gender groups exist)
  if (allSpriteFiles.length > 0) {
    const relativePath = spriteFiles.length > 0
      ? path.relative(spritesRoot, dirPath).replace(/\\/g, "/")
      : (variantSourcePath || path.relative(spritesRoot, dirPath).replace(/\\/g, "/"));
    const id = buildStyleId(regionName, displayName);
    const styleObj = {
      id,
      name: displayName,
      region: regionName,
      path: relativePath,
      type: detectType(allSpriteFiles),
      extensions: [...new Set(allSpriteFiles.map((f) => path.extname(f).toLowerCase()))],
      namingPattern: detectNamingPattern(allSpriteFiles),
      generations: detectGenerations(regionName),
      fileCount: allSpriteFiles.length,
    };
    // Attach genderDirs if this parent directory has gender groups
    if (hasGenderGroups && genderGroups._exact) {
      const gdrp = {};
      for (const [key, gDir] of Object.entries(genderGroups._exact)) {
        if (gDir && fs.existsSync(gDir)) {
          gdrp[key] = path.relative(spritesRoot, gDir).replace(/\\/g, "/");
        }
      }
      if (Object.keys(gdrp).length > 0) styleObj.genderDirs = gdrp;
    }
    results.push(styleObj);
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
  let genderDirs = null;
  let matchedStyle = null;
  const root = spritesRoot || path.resolve("Recursos", "Sprites");

  if (styleId) {
    const styles = scanSprites(root);
    matchedStyle = styles.find(s => s.id === styleId);
    if (!matchedStyle && stylePath) {
      const lastSegment = stylePath.split('/').pop().split('\\').pop();
      matchedStyle = styles.find(s => s.name === lastSegment || s.name.startsWith(lastSegment + ' -'));
    }
    if (matchedStyle) {
      dir = path.join(root, matchedStyle.path);
      relativeBase = matchedStyle.path;
      genderDirs = matchedStyle.genderDirs || null;
    }
  }

  if (!dir) {
    if (stylePath) {
      dir = path.isAbsolute(stylePath) ? stylePath : path.join(root, stylePath);
      relativeBase = path.relative(root, dir).replace(/\\/g, "/");
    } else {
      Logger.warn('Sprites', `No stylePath or match found for styleId=${styleId}`);
      return null;
    }
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

    // pm prefix (BDSP: pm0004_00_00_00_L.png)
    for (const num of allIds) {
      c.push(`pm${num.padStart(4, '0')}_00_00_00_L`);
    }
    // pokeicon prefix (LEGENDS ARCEUS: pokeicon_l_0025_000_000_n_00000000_fn_n)
    for (const num of allIds) {
      c.push(`pokeicon_l_${num.padStart(4, '0')}_000_000_n_00000000_fn_n`);
    }
    // conquest prefix (conquest-portrait__004.png)
    for (const num of allIds) {
      c.push(`conquest-portrait__${num.padStart(3, '0')}`);
    }

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
      // pm prefix (BDSP style: pm0004_00_00_00_L.png)
      else if (/^pm\d/i.test(base)) {
        const matchNum = base.match(/^pm0*(\d+)/i);
        if (matchNum && matchNum[1] === numStr) {
          score = 800;
          if (formInfo && formInfo.code && base.includes('_' + formInfo.code)) score += 50;
        }
      }
      // Prefix with double-underscore ID (conquest-portrait__004.png)
      else if (/^[a-z].+__\d+$/i.test(baseLower)) {
        const matchNum = base.match(/__(0*\d+)$/);
        if (matchNum && matchNum[1].replace(/^0+/, '') === numStr) {
          score = 800;
        }
      }
      // Starts with padded ID followed by separator
      if (score === 0 && /^\d+[-_. ]/.test(base)) {
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
            // No form requested: penalize files with known form keywords (word boundary OR as suffix in segment)
            const formKeywords = ['alola', 'galar', 'hisui', 'paldea', 'mega', 'gmax', 'gigantamax',
              'attack', 'defense', 'speed', 'zen', 'blade', 'shield', 'east', 'west',
              'sunshine', 'overcast', 'rainy', 'snowy', 'sunny', 'school', 'solo',
              'aria', 'pirouette', 'incarnate', 'therian', 'resolute', 'ordinary',
              'black', 'white', 'dusk', 'midday', 'midnight', 'ultra', 'origin',
              'altered', 'neutral', 'hero', 'land', 'sky', 'noice', 'antique', 'phony',
              'average', 'large', 'small', 'super', 'nosparks', 'cap', 'belle'];
            const hasFormKeyword = formKeywords.some(kw => {
              // Word-boundary match
              const wordBoundaryRegex = new RegExp('(?:^|[-_.\\s])' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[-_.\\s]|$)', 'i');
              if (wordBoundaryRegex.test(baseLower)) return true;
              // Also match as suffix within a segment: e.g. "alolacap" contains "alola" at start
              const segments = baseLower.split(/[-_.\s]/);
              return segments.some(seg => seg.startsWith(kw) && seg !== kw && seg.length > kw.length);
            });
            if (hasFormKeyword) score -= 200;
            // Penalize gender suffixes when no gender requested
            if (!genderCode && (baseLower.endsWith('-f') || baseLower.endsWith('-m') || baseLower.endsWith('_f') || baseLower.endsWith('_m'))) {
              score -= 100;
            }
            // Prefer files with fewer segments (base form over form variants)
            const fileSegments = base.split(/[-_.]/);
            if (fileSegments.length <= 2) score += 5;
            // Also prefer fewer space-separated words (Sugimori: "Pikachu" > "Pikachu Hoenn")
            const wordCount = base.split(/\s+/).length;
            if (wordCount <= 2) score += 5;
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
      if (score === 0 && /^0*\d+[a-z]/.test(baseLower)) {
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
      // pokeicon_l_NNNN_* format (LEGENDS ARCEUS)
      if (score === 0 && /^pokeicon_l_\d+/i.test(baseLower)) {
        const matchNum = baseLower.match(/^pokeicon_l_0*(\d+)/);
        if (matchNum && matchNum[1] === numStr) {
          score = 700;
          // Check if it's the shiny variant (_r at end vs _n)
          if (shinyFlag && /_r\.png$/.test(baseLower)) score += 30;
          if (!shinyFlag && /_r\.png$/.test(baseLower)) score -= 200;
          // Form index: second number after first underscore group
          if (formInfo) score += 50;
        }
      }
      // Sugimori style: "0025 Pikachu Alola" (space-separated)
      if (score === 0 && /^\d+\s+[A-Z]/.test(base)) {
        const matchNum = base.match(/^0*(\d+)/);
        if (matchNum && matchNum[1] === numStr) {
          score = 600;
          if (formInfo && formInfo.named) {
            const namedLower = formInfo.named.toLowerCase();
            // Word-boundary match for Sugimori style
            const words = baseLower.split(/\s+/);
            if (words.some(w => w === namedLower)) score += 80;
          } else if (!formInfo) {
            // No form requested: prefer files with fewer words (base form)
            const words = base.trim().split(/\s+/);
            if (words.length === 2) score += 10; // "0025 Pikachu" preferred over "0025 Pikachu Belle"
            const formKeywords = ['alola', 'galar', 'hisui', 'paldea', 'mega', 'gmax', 'gigantamax',
              'belle', 'cap', 'attack', 'defense', 'speed', 'zen', 'blade', 'shield'];
            const hasFormKeyword = words.slice(2).some(w => formKeywords.some(kw => w.toLowerCase().includes(kw)));
            if (hasFormKeyword) score -= 200;
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

  // --- Search for shiny in a specific gender directory ---
  function findInShinyDirsForGender(gDir) {
    const dirsToCheck = [];

    // 1. Child directories of the gender dir
    if (fs.existsSync(gDir.absPath)) {
      const allEntries = fs.readdirSync(gDir.absPath, { withFileTypes: true });
      const shinyDirs = allEntries.filter(e => e.isDirectory() && e.name.toLowerCase().includes('shiny'));
      for (const entry of shinyDirs) {
        dirsToCheck.push({
          absPath: path.join(gDir.absPath, entry.name),
          relBase: `${gDir.relBase}/${entry.name}`
        });
      }
    }

    // 2. Sibling directories at parent level (e.g., "Male Shiny" next to "Male")
    const parentDir = path.dirname(gDir.absPath);
    const parentRelBase = path.dirname(gDir.relBase);
    if (fs.existsSync(parentDir)) {
      const genderName = path.basename(gDir.absPath).toLowerCase();
      const siblings = fs.readdirSync(parentDir, { withFileTypes: true });
      for (const sib of siblings) {
        if (!sib.isDirectory()) continue;
        if (sib.name.toLowerCase().includes('shiny')) {
          const sibLower = sib.name.toLowerCase();
          // Word-boundary match: "Male Shiny" matches "male", "feMale Shiny" does NOT match "male"
          const genderWordRegex = new RegExp('(?:^|[-_.\\s])' + genderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[-_.\\s]|$)', 'i');
          const sibWithoutShiny = sibLower.replace('shiny', '').trim();
          const matchesGender = genderWordRegex.test(sibLower) || genderName === sibWithoutShiny;
          if (matchesGender) {
            const absPath = path.join(parentDir, sib.name);
            const relBase = `${parentRelBase}/${sib.name}`;
            // Avoid duplicates
            if (!dirsToCheck.some(d => d.absPath === absPath)) {
              dirsToCheck.push({ absPath, relBase });
            }
          }
        }
      }
    }

    for (const shinyDir of dirsToCheck) {
      if (!fs.existsSync(shinyDir.absPath)) continue;

      // Try exact candidates first
      const candidates = allBasenames(idStr, form, false, gender);
      for (const c of candidates) {
        const found = fileExistsInDir(shinyDir.absPath, shinyDir.relBase, c);
        if (found) return found;
      }

      // Then fuzzy
      const fuzzy = fuzzyFind(shinyDir.absPath, shinyDir.relBase, idStr, form, false, gender);
      if (fuzzy) return fuzzy;
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

  // If style has genderDirs, search in the appropriate gender directory
  if (genderDirs && (genderDirs.male || genderDirs.female)) {
    const genderLower = gender ? gender.toLowerCase() : null;
    // Determine search order: specified gender first, then the other
    const searchDirs = [];
    if (genderLower === 'male' || genderLower === 'm' || genderLower === 'macho') {
      if (genderDirs.male) searchDirs.push({ key: 'male', absPath: path.join(root, genderDirs.male), relBase: genderDirs.male });
      if (genderDirs.female) searchDirs.push({ key: 'female', absPath: path.join(root, genderDirs.female), relBase: genderDirs.female });
    } else if (genderLower === 'female' || genderLower === 'f' || genderLower === 'hembra') {
      if (genderDirs.female) searchDirs.push({ key: 'female', absPath: path.join(root, genderDirs.female), relBase: genderDirs.female });
      if (genderDirs.male) searchDirs.push({ key: 'male', absPath: path.join(root, genderDirs.male), relBase: genderDirs.male });
    } else {
      // No gender specified: try male first, then female
      if (genderDirs.male) searchDirs.push({ key: 'male', absPath: path.join(root, genderDirs.male), relBase: genderDirs.male });
      if (genderDirs.female) searchDirs.push({ key: 'female', absPath: path.join(root, genderDirs.female), relBase: genderDirs.female });
    }

    // If no male dir, also search parent dir (which has default/male sprites)
    if (!genderDirs.male && genderDirs.female) {
      const parentDir = path.dirname(path.join(root, genderDirs.female));
      const parentRelBase = path.relative(root, parentDir).replace(/\\/g, "/");
      if (fs.existsSync(parentDir)) {
        searchDirs.push({ key: 'default', absPath: parentDir, relBase: parentRelBase });
      }
    }

    for (const gDir of searchDirs) {
      if (!fs.existsSync(gDir.absPath)) continue;

      // 1. If shiny requested, search shiny subdirs in gender dir
      if (shiny) {
        const shinyResult = findInShinyDirsForGender(gDir);
        if (shinyResult) return shinyResult;
      }

      // 2. Try exact candidates in gender dir
      const candidates = allBasenames(idStr, form, shiny, gender);
      for (const c of candidates) {
        const found = fileExistsInDir(gDir.absPath, gDir.relBase, c);
        if (found) return found;
      }

      // 3. Fuzzy match in gender dir
      const fuzzyResult = fuzzyFind(gDir.absPath, gDir.relBase, idStr, form, shiny, gender);
      if (fuzzyResult) return fuzzyResult;

      // 4. Check subdirectories (form dirs, etc.)
      const entries = fs.readdirSync(gDir.absPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.toLowerCase().includes('shiny')) continue;
        const subCandidates = allBasenames(idStr, form, shiny, gender);
        for (const c of subCandidates) {
          const found = fileExistsInDir(path.join(gDir.absPath, entry.name), `${gDir.relBase}/${entry.name}`, c);
          if (found) return found;
        }
        const subFuzzy = fuzzyFind(path.join(gDir.absPath, entry.name), `${gDir.relBase}/${entry.name}`, idStr, form, shiny, gender);
        if (subFuzzy) return subFuzzy;
      }
    }

    // All gender dirs tried and nothing found
    Logger.warn('Sprites', `No sprite found for species ${speciesId} in gender dirs of ${relativeBase}`);
    return null;
  }

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

function getPreviewSprite(spritesRoot, stylePath) {
  const dir = path.join(spritesRoot, stylePath);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isFile())
    .map(d => d.name)
    .filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ['.png', '.gif', '.jpg', '.jpeg', '.webp'].includes(ext);
    });
  if (files.length === 0) return null;
  files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return stylePath + '/' + files[0];
}

module.exports = { scanSprites, resolveSprite, detectNamingPattern, invalidateStyleCache, getPreviewSprite };
