/**
 * Simple structured logger for Clay automation.
 */

const { CONFIG } = require('../config');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level, source, message, data = {}) {
  if (LEVELS[level] < LEVELS[CONFIG.automation.logLevel]) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    ...Object.keys(data).length > 0 ? { data } : {},
  };

  const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${source}]`;
  if (level === 'error') {
    console.error(`${prefix} ${message}`, Object.keys(data).length > 0 ? data : '');
  } else {
    console.log(`${prefix} ${message}`, Object.keys(data).length > 0 ? data : '');
  }
}

module.exports = {
  debug: (source, msg, data) => log('debug', source, msg, data),
  info: (source, msg, data) => log('info', source, msg, data),
  warn: (source, msg, data) => log('warn', source, msg, data),
  error: (source, msg, data) => log('error', source, msg, data),
};
