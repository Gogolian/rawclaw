import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const MEMORY_DIR = join(projectRoot, 'memory');

/**
 * Sanitize a conversation ID to prevent path traversal.
 * Only allows alphanumerics, hyphens, and underscores.
 */
function sanitizeId(id) {
  return String(id).replace(/[^a-zA-Z0-9\-_]/g, '_');
}

function getFilePath(id) {
  const safeId = sanitizeId(id);
  return join(MEMORY_DIR, `${safeId}.json`);
}

function ensureMemoryDir() {
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

/**
 * Load conversation messages. Returns empty array if not found.
 *
 * @param {string} id - Conversation ID
 * @returns {Array} Array of message objects
 */
function loadConversation(id) {
  const filePath = getFilePath(id);
  if (!existsSync(filePath)) {
    return [];
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Save conversation messages to disk.
 *
 * @param {string} id - Conversation ID
 * @param {Array} messages - Array of message objects
 */
function saveConversation(id, messages) {
  ensureMemoryDir();
  const filePath = getFilePath(id);
  writeFileSync(filePath, JSON.stringify(messages, null, 2), 'utf8');
}

/**
 * List all conversation IDs stored in the memory directory.
 *
 * @returns {string[]} Array of conversation IDs
 */
function listConversations() {
  if (!existsSync(MEMORY_DIR)) {
    return [];
  }
  try {
    return readdirSync(MEMORY_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
}

export { loadConversation, saveConversation, listConversations, sanitizeId };
