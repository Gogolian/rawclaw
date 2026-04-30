import https from 'node:https';
import http from 'node:http';

const ANTHROPIC_HOST = 'api.anthropic.com';
const ANTHROPIC_PATH = '/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Make a POST request to the Anthropic Messages API.
 *
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {string} opts.system
 * @param {Array}  opts.messages
 * @param {Array}  [opts.tools]
 * @param {number} [opts.maxTokens]
 * @param {object} [opts.httpsImpl]  - Injectable for tests (replaces node:https)
 * @returns {Promise<object>} Parsed JSON response from Anthropic
 */
function callAnthropic({ apiKey, model, system, messages, tools, maxTokens = 4096, httpsImpl }) {
  const body = JSON.stringify({
    model,
    system,
    messages,
    tools: tools && tools.length > 0 ? tools : undefined,
    max_tokens: maxTokens,
  });

  const options = {
    hostname: ANTHROPIC_HOST,
    path: ANTHROPIC_PATH,
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    },
  };

  const transport = httpsImpl ?? https;

  return new Promise((resolve, reject) => {
    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Anthropic API error ${res.statusCode}: ${raw}`));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(new Error(`Failed to parse Anthropic response: ${raw}`));
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
 * Async generator that streams content deltas from Anthropic via SSE.
 *
 * @param {object} opts - Same as callAnthropic plus stream:true is added internally
 * @yields {string} Text deltas as they arrive
 */
async function* streamAnthropic({ apiKey, model, system, messages, tools, maxTokens = 4096, httpsImpl }) {
  const body = JSON.stringify({
    model,
    system,
    messages,
    tools: tools && tools.length > 0 ? tools : undefined,
    max_tokens: maxTokens,
    stream: true,
  });

  const options = {
    hostname: ANTHROPIC_HOST,
    path: ANTHROPIC_PATH,
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    },
  };

  const transport = httpsImpl ?? https;

  // Collect the raw SSE stream into an async iterable of lines
  const lines = await new Promise((resolve, reject) => {
    const req = transport.request(options, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => reject(new Error(`Anthropic API error ${res.statusCode}: ${Buffer.concat(chunks).toString('utf8')}`)));
        return;
      }
      resolve(res);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  // Buffer partial SSE chunks and yield text deltas
  let buffer = '';
  for await (const chunk of lines) {
    buffer += chunk.toString('utf8');
    // SSE events are separated by double newlines
    const parts = buffer.split('\n\n');
    // Keep the last (possibly incomplete) part in the buffer
    buffer = parts.pop();

    for (const part of parts) {
      const eventLine = part.split('\n').find((l) => l.startsWith('event:'));
      const dataLine = part.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;

      const eventType = eventLine ? eventLine.slice('event:'.length).trim() : '';
      const data = dataLine.slice('data:'.length).trim();

      if (eventType === 'content_block_delta') {
        try {
          const parsed = JSON.parse(data);
          if (parsed.delta?.type === 'text_delta') {
            yield parsed.delta.text;
          }
        } catch {
          // Ignore malformed SSE data
        }
      }
    }
  }
}

export { callAnthropic, streamAnthropic };
