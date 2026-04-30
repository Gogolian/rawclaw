import { readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname } from 'node:path';
import { loadConfig } from './src/config.js';
import { logger } from './src/logger.js';
import { registerTool } from './src/tools.js';
import { startCLI } from './src/channels/cli.js';
import { startTelegram } from './src/channels/telegram.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Dynamically load skill files from the skills directory.
 * Each skill file must export { name, description, input_schema, run }.
 */
async function loadSkills(skillsDir) {
  const dir = resolve(__dirname, skillsDir);
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  } catch {
    logger.warn(`Skills directory '${skillsDir}' not found or unreadable. Skipping.`);
    return;
  }

  for (const file of files) {
    const filePath = join(dir, file);
    try {
      const skill = await import(pathToFileURL(filePath).href);
      if (skill.name && skill.run) {
        registerTool(skill);
        logger.info(`Loaded skill: ${skill.name}`);
      } else {
        logger.warn(`Skill file '${file}' does not export { name, run }. Skipping.`);
      }
    } catch (err) {
      logger.warn(`Failed to load skill '${file}': ${err.message}`);
    }
  }
}

async function main() {
  const config = loadConfig();

  // Load skills from the configured directory
  const skillsDir = config.skillsDir ?? './skills';
  await loadSkills(skillsDir);

  // Start Telegram if enabled
  if (config.channels?.telegram?.enabled) {
    startTelegram(config).catch((err) => {
      logger.error(`Telegram channel crashed: ${err.message}`);
    });
  }

  // Always start the CLI (it runs the readline event loop)
  await startCLI(config);
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\nInterrupted. Goodbye.');
  process.exit(0);
});

main();
