import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OllamaProvider } from '../dist/providers/ollama.js';
import { ProviderError } from '../dist/providers/provider.js';

const config = {
  provider: 'ollama', model: 'test-model', endpoint: 'http://127.0.0.1:11434', contextTarget: 4096,
  timeoutMs: 100, maxInputBytes: 20, maxOutputBytes: 1024,
};
const json = (value, init) => new Response(JSON.stringify(value), init);
const code = (expected) => (error) => error instanceof ProviderError && error.code === expected
  && !error.message.includes('private-marker');

test('translates capabilities and generation into provider-neutral output', async () => {
  const calls = [];
  const provider = new OllamaProvider(config, async (url, init) => {
    calls.push({ url: url.toString(), init, body: JSON.parse(init.body) });
    return calls.length === 1
      ? json({ capabilities: ['completion', 'thinking'] })
      : json({ model: 'test-model', response: 'result', done: true, done_reason: 'stop' });
  });
  const result = await provider.generate({ prompt: 'task' });
  assert.deepEqual({ ...result, durationMs: 0 }, {
    status: 'success', content: 'result', model: 'test-model', durationMs: 0, truncated: false, warnings: [],
  });
  assert.equal(calls[0].url, 'http://127.0.0.1:11434/api/show');
  assert.deepEqual(calls[0].body, { model: 'test-model' });
  assert.equal(calls[0].init.redirect, 'manual');
  assert.deepEqual(calls[1].body, {
    model: 'test-model', prompt: 'task', stream: false, options: { num_ctx: 4096 }, think: false,
  });
});

test('uses explicit think only with reported support', async () => {
  const bodies = [];
  const request = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return bodies.length % 2 === 1 ? json({ capabilities: bodies.length === 1 ? ['thinking'] : [] })
      : json({ model: 'test-model', response: 'ok', done: true });
  };
  await new OllamaProvider({ ...config, think: true }, request).generate({ prompt: 'task' });
  assert.equal(bodies[1].think, true);
  await assert.rejects(new OllamaProvider({ ...config, think: false }, request).generate({ prompt: 'task' }), code('unsupported_capability'));
  assert.equal(bodies.length, 3);
});

test('rejects oversized input before making a request', async () => {
  let called = false;
  const provider = new OllamaProvider(config, async () => { called = true; return json({}); });
  await assert.rejects(provider.generate({ prompt: '123456789012345678901' }), code('invalid_input'));
  assert.equal(called, false);
});

test('bounds chunked responses and detects model truncation', async () => {
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('{"private-marker":"'));
    controller.enqueue(new Uint8Array(100));
    controller.close();
  } });
  await assert.rejects(new OllamaProvider({ ...config, maxOutputBytes: 10 }, async () => new Response(stream))
    .generate({ prompt: 'task' }), code('truncated'));
  const responses = [json({ capabilities: [] }), json({ model: 'test-model', response: 'partial', done: true, done_reason: 'length' })];
  await assert.rejects(new OllamaProvider(config, async () => responses.shift()).generate({ prompt: 'task' }), code('truncated'));
  const incomplete = [json({ capabilities: [] }), json({ model: 'test-model', response: 'partial', done: false })];
  await assert.rejects(new OllamaProvider(config, async () => incomplete.shift()).generate({ prompt: 'task' }), code('truncated'));
});

test('normalizes invalid responses, redirects and provider failures without raw bodies', async () => {
  const cases = [
    { response: json({ capabilities: 'thinking' }), expected: 'invalid_provider_response' },
    { response: new Response('private-marker', { status: 500 }), expected: 'provider_error' },
    { response: new Response(null, { status: 302, headers: { location: 'https://example.invalid' } }), expected: 'provider_error' },
    { response: new Response(new Uint8Array([0xff])), expected: 'invalid_provider_response' },
  ];
  for (const { response, expected } of cases) {
    await assert.rejects(new OllamaProvider(config, async () => response).generate({ prompt: 'task' }), code(expected));
  }
  await assert.rejects(new OllamaProvider(config, async () => { throw new Error('private-marker'); })
    .generate({ prompt: 'task' }), code('provider_error'));
  const generated = [json({ capabilities: [] }), json({ model: 'wrong-model', response: 'private-marker', done: true })];
  await assert.rejects(new OllamaProvider(config, async () => generated.shift()).generate({ prompt: 'task' }), code('invalid_provider_response'));
});

test('distinguishes timeout and caller cancellation', async () => {
  const hanging = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  await assert.rejects(new OllamaProvider({ ...config, timeoutMs: 5 }, hanging).generate({ prompt: 'task' }), code('timeout'));
  const controller = new AbortController();
  const pending = new OllamaProvider(config, hanging).generate({ prompt: 'task', signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, code('cancelled'));
  controller.abort();
  await assert.rejects(new OllamaProvider(config, hanging).generate({ prompt: 'task', signal: controller.signal }), code('cancelled'));

  const bodyHanging = async (_url, { signal }) => new Response(new ReadableStream({ start(stream) {
    signal.addEventListener('abort', () => stream.error(signal.reason), { once: true });
  } }));
  await assert.rejects(new OllamaProvider({ ...config, timeoutMs: 5 }, bodyHanging).generate({ prompt: 'task' }), code('timeout'));
});
