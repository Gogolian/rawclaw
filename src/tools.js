import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, realpathSync } from 'node:fs';
import { resolve, join, isAbsolute, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { spawn } from 'node:child_process';
import https from 'node:https';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, '..');
const workspaceRootReal = realpathSync(workspaceRoot);

function isInsideWorkspace(path) {
  return path === workspaceRootReal || path.startsWith(workspaceRootReal + sep);
}

function nearestExistingPath(path) {
  let current = path;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`No existing path found for '${path}'.`);
    }
    current = parent;
  }
  return current;
}

/**
 * Reject any path that tries to escape the workspace via '..' segments.
 * Returns the resolved absolute path if safe, throws otherwise.
 */
function safeResolvePath(userPath) {
  const resolved = isAbsolute(userPath)
    ? normalize(userPath)
    : resolve(workspaceRoot, userPath);

  if (!resolved.startsWith(workspaceRoot + sep) && resolved !== workspaceRoot) {
    throw new Error(`Path '${userPath}' is outside the workspace.`);
  }
  if (!isInsideWorkspace(realpathSync(nearestExistingPath(resolved)))) {
    throw new Error(`Path '${userPath}' is outside the workspace.`);
  }
  return resolved;
}

const readFileTool = {
  name: 'read_file',
  description: 'Read the contents of a file inside the workspace.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative or absolute path to the file.' },
    },
    required: ['path'],
  },
  run({ path: userPath }) {
    const safe = safeResolvePath(userPath);
    return readFileSync(safe, 'utf8');
  },
};

const writeFileTool = {
  name: 'write_file',
  description: 'Write text content to a file inside the workspace.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative or absolute path to the file.' },
      content: { type: 'string', description: 'Text content to write.' },
    },
    required: ['path', 'content'],
  },
  run({ path: userPath, content }) {
    const safe = safeResolvePath(userPath);
    writeFileSync(safe, content, 'utf8');
    return `Wrote ${content.length} bytes to ${safe}`;
  },
};

const listDirectoryTool = {
  name: 'list_directory',
  description: 'List the entries in a directory inside the workspace.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative or absolute path to the directory.' },
    },
    required: ['path'],
  },
  run({ path: userPath }) {
    const safe = safeResolvePath(userPath);
    const entries = readdirSync(safe).map((name) => {
      const fullPath = join(safe, name);
      const stat = statSync(fullPath);
      return { name, type: stat.isDirectory() ? 'dir' : 'file' };
    });
    return JSON.stringify(entries, null, 2);
  },
};

const runShellTool = {
  name: 'run_shell',
  description: 'Run a shell command and return its stdout and stderr. Must be enabled in config.',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to run.' },
      timeout_ms: { type: 'number', description: 'Timeout in milliseconds. Default 30000.' },
    },
    required: ['command'],
  },
  run({ command, timeout_ms = 30000 }, config) {
    if (!config?.tools?.shell?.enabled) {
      throw new Error('Shell tool is disabled. Set tools.shell.enabled = true in config.json to enable it.');
    }
    return new Promise((resolve, reject) => {
      const proc = spawn(command, { shell: true });
      const stdoutChunks = [];
      const stderrChunks = [];

      proc.stdout.on('data', (d) => stdoutChunks.push(d));
      proc.stderr.on('data', (d) => stderrChunks.push(d));

      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error(`Command timed out after ${timeout_ms}ms`));
      }, timeout_ms);

      proc.on('close', (code) => {
        clearTimeout(timer);
        const stdout = Buffer.concat(stdoutChunks).toString('utf8');
        const stderr = Buffer.concat(stderrChunks).toString('utf8');
        resolve(JSON.stringify({ exitCode: code, stdout, stderr }));
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  },
};

const httpFetchTool = {
  name: 'http_fetch',
  description: 'Make an HTTP or HTTPS request and return the response body.',
  input_schema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch.' },
      method: { type: 'string', description: 'HTTP method. Default GET.' },
      headers: { type: 'object', description: 'Optional request headers.' },
      body: { type: 'string', description: 'Optional request body.' },
    },
    required: ['url'],
  },
  run({ url, method = 'GET', headers = {}, body }) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const transport = parsed.protocol === 'https:' ? https : http;

      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method,
        headers,
      };

      const req = transport.request(options, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString('utf8');
          resolve(JSON.stringify({
            statusCode: res.statusCode,
            headers: res.headers,
            body: responseBody,
          }));
        });
        res.on('error', reject);
      });

      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  },
};

// Registry holds all built-in tools and dynamically loaded skills
const toolRegistry = new Map();

function registerTool(tool) {
  toolRegistry.set(tool.name, tool);
}

function getTool(name) {
  return toolRegistry.get(name);
}

function getAllTools() {
  return Array.from(toolRegistry.values());
}

/**
 * Get the JSON schema definitions for all registered tools,
 * formatted for the Anthropic tools parameter.
 */
function getToolSchemas() {
  return getAllTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema,
  }));
}

// Register built-in tools
registerTool(readFileTool);
registerTool(writeFileTool);
registerTool(listDirectoryTool);
registerTool(runShellTool);
registerTool(httpFetchTool);

export { registerTool, getTool, getAllTools, getToolSchemas, safeResolvePath };
