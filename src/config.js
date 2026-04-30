import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

function loadJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function loadConfig() {
  const configPath = resolve(projectRoot, 'config.json');
  const examplePath = resolve(projectRoot, 'config.example.json');

  // Start with example defaults, then overlay user config if present
  const defaults = loadJsonFile(examplePath) ?? {};
  const userConfig = loadJsonFile(configPath) ?? {};

  const config = { ...defaults, ...userConfig };

  // Overlay environment variables
  if (process.env.ANTHROPIC_API_KEY) {
    config.apiKey = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.RAWCLAW_MODEL) {
    config.model = process.env.RAWCLAW_MODEL;
  }
  if (process.env.RAWCLAW_TELEGRAM_TOKEN) {
    config.channels = config.channels ?? {};
    config.channels.telegram = config.channels.telegram ?? {};
    config.channels.telegram.token = process.env.RAWCLAW_TELEGRAM_TOKEN;
  }

  // API key is required
  if (!config.apiKey) {
    console.error(
      '\nError: ANTHROPIC_API_KEY is not set.\n\n' +
      'To fix this:\n' +
      '  1. Get your API key from https://console.anthropic.com/\n' +
      '  2. Run: export ANTHROPIC_API_KEY=sk-ant-...\n' +
      '  3. Then run: node index.js\n'
    );
    process.exit(1);
  }

  return config;
}

export { loadConfig };
