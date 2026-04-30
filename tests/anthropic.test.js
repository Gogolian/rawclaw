import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callAnthropic } from '../src/anthropic.js';

/**
 * Build a fake httpsImpl that returns a predefined status + body
 * without making any real network requests.
 */
function buildFakeHttps(statusCode, responseBody) {
  return {
    request(options, callback) {
      const req = {
        write() {},
        on(event, handler) { return this; },
        end() {
          let dataHandler = null;
          let endHandler = null;

          const res = {
            statusCode,
            on(event, handler) {
              if (event === 'data') dataHandler = handler;
              if (event === 'end') endHandler = handler;
              return this;
            },
          };

          // Call callback to deliver the response object, then emit data/end
          callback(res);

          setImmediate(() => {
            if (dataHandler) dataHandler(Buffer.from(responseBody));
            if (endHandler) setImmediate(endHandler);
          });
        },
      };
      return req;
    },
  };
}

test('callAnthropic - successful 200 response', async () => {
  const fakeResponse = {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'Hello, world!' }],
    stop_reason: 'end_turn',
  };

  const fakeHttps = buildFakeHttps(200, JSON.stringify(fakeResponse));

  const result = await callAnthropic({
    apiKey: 'sk-test',
    model: 'claude-3-5-haiku-20241022',
    system: 'You are a test assistant.',
    messages: [{ role: 'user', content: 'Hi' }],
    httpsImpl: fakeHttps,
  });

  assert.equal(result.role, 'assistant');
  assert.equal(result.content[0].text, 'Hello, world!');
  assert.equal(result.stop_reason, 'end_turn');
});

test('callAnthropic - throws on non-2xx response', async () => {
  const fakeHttps = buildFakeHttps(401, JSON.stringify({ error: { message: 'Unauthorized' } }));

  await assert.rejects(
    () => callAnthropic({
      apiKey: 'bad-key',
      model: 'claude-3-5-haiku-20241022',
      system: 'test',
      messages: [{ role: 'user', content: 'Hi' }],
      httpsImpl: fakeHttps,
    }),
    (err) => {
      assert.ok(err.message.includes('401'), `Expected 401 in error message, got: ${err.message}`);
      return true;
    }
  );
});

test('callAnthropic - passes correct headers', async () => {
  let capturedOptions = null;
  const fakeResponse = {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'OK' }],
    stop_reason: 'end_turn',
  };

  const fakeHttps = {
    request(options, callback) {
      capturedOptions = options;
      const req = {
        write() {},
        on(event, handler) { return this; },
        end() {
          const res = {
            statusCode: 200,
            on(event, handler) {
              if (event === 'data') setImmediate(() => handler(Buffer.from(JSON.stringify(fakeResponse))));
              if (event === 'end') setImmediate(() => { setImmediate(handler); });
              return this;
            },
          };
          callback(res);
        },
      };
      return req;
    },
  };

  await callAnthropic({
    apiKey: 'sk-test-key',
    model: 'claude-test',
    system: 'test',
    messages: [{ role: 'user', content: 'Hi' }],
    httpsImpl: fakeHttps,
  });

  assert.equal(capturedOptions.headers['x-api-key'], 'sk-test-key');
  assert.equal(capturedOptions.headers['anthropic-version'], '2023-06-01');
  assert.equal(capturedOptions.headers['content-type'], 'application/json');
  assert.equal(capturedOptions.method, 'POST');
  assert.equal(capturedOptions.hostname, 'api.anthropic.com');
});
