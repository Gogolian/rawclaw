import { createInterface } from 'node:readline';
import { runAgent } from '../agent.js';
import { logger } from '../logger.js';

const CONVERSATION_ID = 'cli';

/**
 * Start the interactive CLI REPL.
 * Each line of input is sent to the agent as a user message.
 * Special commands:
 *   /reset  - Start a fresh conversation
 *   /exit   - Quit the process
 *
 * @param {object} config - The loaded config object
 */
async function startCLI(config) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  let conversationId = CONVERSATION_ID;

  console.log('rawclaw is ready. Type a message, /reset to start over, or /exit to quit.\n');
  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    if (input === '/exit') {
      console.log('Goodbye.');
      rl.close();
      process.exit(0);
    }

    if (input === '/reset') {
      // Use a new unique ID to start fresh (old history stays on disk)
      conversationId = `cli-${Date.now()}`;
      console.log('Conversation reset.\n');
      rl.prompt();
      return;
    }

    rl.pause();

    try {
      const response = await runAgent({
        userMessage: input,
        conversationId,
        config,
      });
      console.log(`\nAssistant: ${response}\n`);
    } catch (err) {
      logger.error(`Agent error: ${err.message}`);
    }

    rl.resume();
    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

export { startCLI };
