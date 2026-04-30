import { createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

let fileStream = null;
let currentLevel = LEVELS.info;

function initFileLogging(logFile) {
  const logPath = resolve(projectRoot, logFile);
  fileStream = createWriteStream(logPath, { flags: 'a' });
}

function setLevel(level) {
  if (LEVELS[level] !== undefined) {
    currentLevel = LEVELS[level];
  }
}

function formatMessage(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
}

function log(level, message) {
  if (LEVELS[level] < currentLevel) return;

  const formatted = formatMessage(level, message);

  if (level === 'error' || level === 'warn') {
    process.stderr.write(formatted + '\n');
  } else {
    process.stdout.write(formatted + '\n');
  }

  if (fileStream) {
    fileStream.write(formatted + '\n');
  }
}

const logger = {
  debug: (msg) => log('debug', msg),
  info: (msg) => log('info', msg),
  warn: (msg) => log('warn', msg),
  error: (msg) => log('error', msg),
  setLevel,
  initFileLogging,
};

export { logger };
