import https from 'node:https';
import { runAgent } from '../agent.js';
import { logger } from '../logger.js';

/**
 * Make a Telegram Bot API request.
 *
 * @param {string} token - Telegram bot token
 * @param {string} method - Telegram API method name
 * @param {object} params - Query or body params
 * @returns {Promise<object>} Parsed JSON response
 */
function telegramRequest(token, method, params = {}) {
  const body = JSON.stringify(params);
  const path = `/bot${token}/${method}`;

  const options = {
    hostname: 'api.telegram.org',
    path,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (err) {
          reject(new Error('Failed to parse Telegram response'));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Send a message to a Telegram chat.
 */
async function sendMessage(token, chatId, text) {
  await telegramRequest(token, 'sendMessage', { chat_id: chatId, text });
}

/**
 * Start the Telegram long-polling loop.
 * Polls getUpdates with a 25-second timeout, processes each message,
 * and replies with the agent's response.
 *
 * @param {object} config - The loaded config object
 */
async function startTelegram(config) {
  const token = config.channels?.telegram?.token;
  if (!token) {
    logger.error('Telegram channel enabled but no token configured.');
    return;
  }

  logger.info('Telegram channel started (long polling).');

  let offset = 0;

  while (true) {
    let updates;
    try {
      const result = await telegramRequest(token, 'getUpdates', {
        offset,
        timeout: 25,
      });
      updates = result.result ?? [];
    } catch (err) {
      logger.error(`Telegram getUpdates error: ${err.message}`);
      // Wait briefly before retrying to avoid tight error loops
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    for (const update of updates) {
      offset = update.update_id + 1;

      const message = update.message;
      if (!message?.text) continue;

      const chatId = message.chat.id;
      const conversationId = `tg-${chatId}`;

      logger.info(`Telegram message from ${chatId}: ${message.text.slice(0, 50)}`);

      try {
        const response = await runAgent({
          userMessage: message.text,
          conversationId,
          config,
        });
        await sendMessage(token, chatId, response);
      } catch (err) {
        logger.error(`Agent error for chat ${chatId}: ${err.message}`);
        await sendMessage(token, chatId, 'Sorry, something went wrong. Please try again.');
      }
    }
  }
}

export { startTelegram };
