const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');

class LogUploader {
  constructor() {
    this.queue = [];
    this.uploading = false;
    this.endpoint = null;
    this.sessionMeta = null;
    this.flushTimer = null;
  }

  configure(endpoint, sessionMeta) {
    this.endpoint = endpoint || null;
    this.sessionMeta = sessionMeta || null;
  }

  queueEvent(entry) {
    if (!this.endpoint) return;
    this.queue.push(entry);
    this._scheduleFlush();
  }

  _scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this._flush();
    }, 5000);
  }

  async _flush() {
    if (this.uploading || this.queue.length === 0 || !this.endpoint) return;
    this.uploading = true;

    const batch = this.queue.splice(0, 50);
    const payload = JSON.stringify({
      appVersion: this.sessionMeta?.appVersion || 'unknown',
      sessionId: this.sessionMeta?.sessionId || 'unknown',
      os: this.sessionMeta?.os || 'unknown',
      dotnetPath: this.sessionMeta?.dotnetPath || 'unknown',
      hostname: this.sessionMeta?.hostname || 'unknown',
      events: batch,
    });

    try {
      await this._post(this.endpoint, payload);
    } catch (e) {
      this.queue.unshift(...batch);
    }

    this.uploading = false;

    if (this.queue.length > 0) {
      this._scheduleFlush();
    }
  }

  async sendNow(entry) {
    if (!this.endpoint) return;
    const payload = JSON.stringify({
      appVersion: this.sessionMeta?.appVersion || 'unknown',
      sessionId: this.sessionMeta?.sessionId || 'unknown',
      os: this.sessionMeta?.os || 'unknown',
      dotnetPath: this.sessionMeta?.dotnetPath || 'unknown',
      hostname: this.sessionMeta?.hostname || 'unknown',
      events: [entry],
    });

    try {
      await this._post(this.endpoint, payload);
    } catch (e) {
      this.queue.push(entry);
      this._scheduleFlush();
    }
  }

  _post(url, body) {
    return new Promise((resolve, reject) => {
      try {
        const parsed = new URL(url);
        const mod = parsed.protocol === 'https:' ? https : http;
        const req = mod.request({
          hostname: parsed.hostname,
          port: parsed.port,
          path: parsed.pathname + parsed.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: 10000,
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.write(body);
        req.end();
      } catch (e) {
        reject(e);
      }
    });
  }

  flush() {
    return this._flush();
  }
}

module.exports = LogUploader;
