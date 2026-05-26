// Logger module — provides accessLog middleware and error/info logging.
// Writes logs to logs/YYYY-MM-DD.log

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');
try { if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (_) {}

function todayFile() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return path.join(LOG_DIR, d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + '.log');
}

function writeLine(level, msg) {
  const line = '[' + new Date().toISOString() + '] [' + level + '] ' + msg + '\n';
  try { fs.appendFileSync(todayFile(), line); } catch (_) {}
}

function accessLog(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const dur = Date.now() - start;
    const status = res.statusCode;
    const marker = status >= 500 ? 'X' : status >= 400 ? '!' : '+';
    const line = marker + ' ' + req.method + ' ' + req.originalUrl + ' -> ' + status + ' (' + dur + 'ms)';
    console.log(line);
    writeLine('access', line);
  });
  next();
}

function info(msg) {
  console.log('[info]', msg);
  writeLine('info', msg);
}

function warn(msg) {
  console.warn('[warn]', msg);
  writeLine('warn', msg);
}

function error(msg, err) {
  const detail = err && err.stack ? err.stack : (err && err.message) || '';
  console.error('[error]', msg, detail);
  writeLine('error', msg + ' ' + detail);
}

module.exports = { accessLog, info, warn, error };
