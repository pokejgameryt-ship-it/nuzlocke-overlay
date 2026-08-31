const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ProjectManager {
  constructor(baseDir) {
    this.projectsDir = path.join(baseDir, 'projects');
    if (!fs.existsSync(this.projectsDir)) {
      fs.mkdirSync(this.projectsDir, { recursive: true });
    }
  }

  generateId() {
    return crypto.randomBytes(8).toString('hex');
  }

  listAll() {
    const files = fs.readdirSync(this.projectsDir).filter(f => f.endsWith('.json'));
    const projects = [];
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.projectsDir, file), 'utf8'));
        projects.push(data);
      } catch (e) {
        console.warn(`Skipping invalid project file: ${file}`);
      }
    }
    return projects;
  }

  get(projectId) {
    const filePath = path.join(this.projectsDir, `${projectId}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  create(data) {
    const id = this.generateId();
    const project = {
      id,
      name: data.name || 'Nuevo Proyecto',
      inputMode: data.inputMode || 'auto',
      savePath: data.savePath || '',
      game: data.game || { generation: 8, saveType: 'gen8', version: 'auto', autoDetected: true },
      spriteStyle: data.spriteStyle || '',
      spriteStylePath: data.spriteStylePath || '',
      showNames: data.showNames !== undefined ? data.showNames : true,
      usePlaceholder: data.usePlaceholder || false,
      placeholderSpriteId: data.placeholderSpriteId || '',
      manualTeam: data.manualTeam || [
        { speciesId: 0, nickname: '' },
        { speciesId: 0, nickname: '' },
        { speciesId: 0, nickname: '' },
        { speciesId: 0, nickname: '' },
        { speciesId: 0, nickname: '' },
        { speciesId: 0, nickname: '' },
      ],
      slots: data.slots || this.getDefaultSlots(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const filePath = path.join(this.projectsDir, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf8');
    return project;
  }

  update(projectId, data) {
    const existing = this.get(projectId);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...data,
      id: projectId,
      updatedAt: new Date().toISOString()
    };

    const filePath = path.join(this.projectsDir, `${projectId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  }

  delete(projectId) {
    const filePath = path.join(this.projectsDir, `${projectId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }

  getDefaultSlots() {
    const slots = [];
    const slotWidth = 120;
    const slotHeight = 120;
    const startX = (1920 - (6 * slotWidth + 5 * 20)) / 2;
    const y = 480;

    for (let i = 0; i < 6; i++) {
      slots.push({
        x: Math.round(startX + i * (slotWidth + 20)),
        y: y,
        width: slotWidth,
        height: slotHeight
      });
    }
    return slots;
  }
}

module.exports = ProjectManager;
