import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { safeResolvePath, getToolSchemas, getTool } from '../src/tools.js';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const outsideTempPrefix = join(tmpdir(), 'rawclaw-outside-');

function makeWorkspaceLinkPath(prefix) {
  const linkPath = mkdtempSync(join(projectRoot, prefix));
  rmSync(linkPath, { force: true, recursive: true });
  return linkPath;
}

test('safeResolvePath - allows paths within workspace', () => {
  const result = safeResolvePath('src/agent.js');
  assert.ok(result.startsWith(projectRoot), `Expected path within ${projectRoot}, got ${result}`);
});

test('safeResolvePath - rejects path traversal with ..', () => {
  assert.throws(
    () => safeResolvePath('../../../etc/passwd'),
    (err) => {
      assert.ok(err.message.includes('outside the workspace'), `Unexpected message: ${err.message}`);
      return true;
    }
  );
});

test('safeResolvePath - rejects absolute path outside workspace', () => {
  assert.throws(
    () => safeResolvePath('/etc/passwd'),
    (err) => {
      assert.ok(err.message.includes('outside the workspace'), `Unexpected message: ${err.message}`);
      return true;
    }
  );
});

test('safeResolvePath - rejects symlinks that point outside workspace', () => {
  const outsideDir = mkdtempSync(outsideTempPrefix);
  const linkPath = makeWorkspaceLinkPath('test-outside-link-');

  try {
    symlinkSync(outsideDir, linkPath, 'dir');
    assert.throws(
      () => safeResolvePath(linkPath),
      (err) => {
        assert.ok(err.message.includes('outside the workspace'), `Unexpected message: ${err.message}`);
        return true;
      }
    );
  } finally {
    rmSync(linkPath, { force: true, recursive: true });
    rmSync(outsideDir, { force: true, recursive: true });
  }
});

test('getToolSchemas - returns schema for all built-in tools', () => {
  const schemas = getToolSchemas();
  const names = schemas.map((s) => s.name);

  assert.ok(names.includes('read_file'), 'Missing read_file tool');
  assert.ok(names.includes('write_file'), 'Missing write_file tool');
  assert.ok(names.includes('list_directory'), 'Missing list_directory tool');
  assert.ok(names.includes('run_shell'), 'Missing run_shell tool');
  assert.ok(names.includes('http_fetch'), 'Missing http_fetch tool');
});

test('getToolSchemas - each schema has required fields', () => {
  const schemas = getToolSchemas();
  for (const schema of schemas) {
    assert.ok(schema.name, `Schema missing name: ${JSON.stringify(schema)}`);
    assert.ok(schema.description, `Schema '${schema.name}' missing description`);
    assert.ok(schema.input_schema, `Schema '${schema.name}' missing input_schema`);
    assert.equal(schema.input_schema.type, 'object', `Schema '${schema.name}' input_schema.type should be 'object'`);
  }
});

test('read_file tool - reads a file within the workspace', async () => {
  const tool = getTool('read_file');
  assert.ok(tool, 'read_file tool not found');

  // Read the package.json which we know exists
  const content = await tool.run({ path: 'package.json' });
  const parsed = JSON.parse(content);
  assert.equal(parsed.name, 'rawclaw');
});

test('read_file tool - rejects path traversal', () => {
  const tool = getTool('read_file');
  assert.throws(
    () => tool.run({ path: '../../../etc/passwd' }),
    (err) => {
      assert.ok(err.message.includes('outside the workspace'));
      return true;
    }
  );
});

test('write_file tool - rejects writes through symlinked directories outside workspace', () => {
  const tool = getTool('write_file');
  const outsideDir = mkdtempSync(outsideTempPrefix);
  const linkPath = makeWorkspaceLinkPath('test-outside-write-link-');

  try {
    symlinkSync(outsideDir, linkPath, 'dir');
    assert.throws(
      () => tool.run({ path: join(basename(linkPath), 'written.txt'), content: 'nope' }),
      (err) => {
        assert.ok(err.message.includes('outside the workspace'), `Unexpected message: ${err.message}`);
        return true;
      }
    );
  } finally {
    rmSync(linkPath, { force: true, recursive: true });
    rmSync(outsideDir, { force: true, recursive: true });
  }
});

test('list_directory tool - lists workspace root', async () => {
  const tool = getTool('list_directory');
  assert.ok(tool, 'list_directory tool not found');

  const raw = await tool.run({ path: '.' });
  const entries = JSON.parse(raw);
  const names = entries.map((e) => e.name);
  assert.ok(names.includes('package.json'), 'Expected package.json in root listing');
  assert.ok(names.includes('src'), 'Expected src directory in root listing');
});

test('run_shell tool - throws when shell is disabled', () => {
  const tool = getTool('run_shell');
  const config = { tools: { shell: { enabled: false } } };

  assert.throws(
    () => tool.run({ command: 'echo hello' }, config),
    (err) => {
      assert.ok(err.message.includes('disabled'), `Unexpected message: ${err.message}`);
      return true;
    }
  );
});

test('run_shell tool - runs command when shell is enabled', async () => {
  const tool = getTool('run_shell');
  const config = { tools: { shell: { enabled: true } } };

  const raw = await tool.run({ command: 'echo hello' }, config);
  const result = JSON.parse(raw);
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.trim().includes('hello'));
});
