import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { loadConversation, saveConversation, listConversations, sanitizeId } from '../src/memory.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const memoryDir = join(projectRoot, 'memory');

test('sanitizeId - strips disallowed characters', () => {
  assert.equal(sanitizeId('hello-world_123'), 'hello-world_123');
  assert.equal(sanitizeId('../etc/passwd'), '___etc_passwd');
  assert.equal(sanitizeId('chat room!'), 'chat_room_');
  assert.equal(sanitizeId('tg-12345'), 'tg-12345');
});

test('loadConversation - returns empty array for unknown id', () => {
  const result = loadConversation('test-nonexistent-' + Date.now());
  assert.deepEqual(result, []);
});

test('saveConversation and loadConversation - round trip', () => {
  const id = `test-roundtrip-${Date.now()}`;
  const messages = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
  ];

  saveConversation(id, messages);
  const loaded = loadConversation(id);
  assert.deepEqual(loaded, messages);

  // Clean up
  const filePath = join(memoryDir, `${id}.json`);
  if (existsSync(filePath)) rmSync(filePath);
});

test('listConversations - includes saved conversation', () => {
  const id = `test-list-${Date.now()}`;
  saveConversation(id, [{ role: 'user', content: 'test' }]);

  const list = listConversations();
  assert.ok(list.includes(id), `Expected '${id}' in list: ${list.join(', ')}`);

  // Clean up
  const filePath = join(memoryDir, `${id}.json`);
  if (existsSync(filePath)) rmSync(filePath);
});

test('saveConversation - sanitizes dangerous id', () => {
  const dangerousId = '../danger';
  const safeId = sanitizeId(dangerousId);
  const messages = [{ role: 'user', content: 'test' }];

  saveConversation(dangerousId, messages);
  const loaded = loadConversation(dangerousId);
  assert.deepEqual(loaded, messages);

  // Ensure the file was written with the safe name, not the dangerous path
  const expectedFile = join(memoryDir, `${safeId}.json`);
  assert.ok(existsSync(expectedFile), `Expected file at ${expectedFile}`);
  rmSync(expectedFile);
});
