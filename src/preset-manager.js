const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class PresetManager {
  constructor(baseDir) {
    this.presetsDir = path.join(baseDir, 'presets');
    if (!fs.existsSync(this.presetsDir)) {
      fs.mkdirSync(this.presetsDir, { recursive: true });
    }
  }

  generateId() {
    return crypto.randomBytes(6).toString('hex');
  }

  listAll() {
    const files = fs.readdirSync(this.presetsDir).filter(f => f.endsWith('.json'));
    const presets = [];
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.presetsDir, file), 'utf8'));
        presets.push(data);
      } catch (e) {
        continue;
      }
    }
    return presets;
  }

  get(presetId) {
    const filePath = path.join(this.presetsDir, `${presetId}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  create(data) {
    const id = this.generateId();
    const preset = {
      id,
      name: data.name || 'Preset sin nombre',
      canvasSize: data.canvasSize || { width: 1920, height: 1080 },
      slots: data.slots || [],
      nicknameSlots: data.nicknameSlots || [],
      nicknameStyle: data.nicknameStyle || {},
      style: data.style || '',
      showNames: data.showNames !== undefined ? data.showNames : true,
      createdAt: new Date().toISOString()
    };
    const filePath = path.join(this.presetsDir, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(preset, null, 2), 'utf8');
    return preset;
  }

  update(presetId, data) {
    const existing = this.get(presetId);
    if (!existing) return null;

    const updated = { ...existing, ...data, id: presetId };
    const filePath = path.join(this.presetsDir, `${presetId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  }

  delete(presetId) {
    const filePath = path.join(this.presetsDir, `${presetId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }
}

module.exports = PresetManager;
