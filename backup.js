// DB backup module — auto-backups app.db daily.
//
// Strategy:
//   - Copy app.db → backups/YYYY-MM-DD_HHMM.db on schedule
//   - Run on server startup (initial backup)
//   - Run every 24 hours after that
//   - Keep last 30 days, auto-delete older
//
// Manual backup:
//   const backup = require('./backup');
//   backup.runNow();  // create one immediately

const fs   = require('fs');
const path = require('path');

const DATA_DIR    = process.env.AZWELL_DB_DIR || path.join(__dirname, 'data');
const BACKUP_DIR  = process.env.AZWELL_BACKUP_DIR || path.join(__dirname, 'backups');
const DB_FILE     = path.join(DATA_DIR, 'app.db');
const KEEP_DAYS   = 30;
const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

function ensureDir() {
  try { if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true }); }
  catch (e) { console.warn('[backup] cannot create dir:', e.message); }
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) +
         '_' + pad(d.getHours()) + pad(d.getMinutes());
}

function runNow() {
  ensureDir();
  try {
    if (!fs.existsSync(DB_FILE)) {
      console.warn('[backup] DB file not found:', DB_FILE);
      return null;
    }
    const filename = 'app_' + timestamp() + '.db';
    const dest = path.join(BACKUP_DIR, filename);
    fs.copyFileSync(DB_FILE, dest);
    const size = (fs.statSync(dest).size / 1024).toFixed(1);
    console.log('[backup] ✓ ' + filename + ' (' + size + ' KB)');
    cleanupOld();
    return dest;
  } catch (e) {
    console.error('[backup] failed:', e.message);
    return null;
  }
}

function cleanupOld() {
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const f of files) {
      if (!/^app_.*\.db$/.test(f)) continue;
      const full = path.join(BACKUP_DIR, f);
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(full);
        removed++;
      }
    }
    if (removed > 0) console.log('[backup] cleaned ' + removed + ' old file(s)');
  } catch (e) { /* ignore */ }
}

function list() {
  ensureDir();
  try {
    return fs.readdirSync(BACKUP_DIR)
      .filter(f => /^app_.*\.db$/.test(f))
      .map(f => {
        const full = path.join(BACKUP_DIR, f);
        const stat = fs.statSync(full);
        return { name: f, size: stat.size, mtime: stat.mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch (_) { return []; }
}

// Schedule: run on startup, then every 24h
function start() {
  setTimeout(runNow, 5000);                    // initial backup after 5s
  setInterval(runNow, INTERVAL_MS);             // every 24h
}

module.exports = { runNow, list, cleanupOld, start, BACKUP_DIR };
