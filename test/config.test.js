import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadConfig } from '../dist/config.js';

const defaults = {
  provider: 'ollama', model: 'example-model', endpoint: 'http://127.0.0.1:11434',
  contextTarget: 16384, timeoutMs: 120000,
};

test('defaults require explicit model and leave think unspecified', async () => {
  await assert.rejects(loadConfig({}), /field: model/);
  assert.deepEqual(await loadConfig({ CODE_WORKER_MODEL: 'example-model' }), defaults);
});

test('file selection, precedence, invalid files and resolved values', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'code-worker-config-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'config.json');
  const env = { CODE_WORKER_CONFIG: path };
  await assert.rejects(loadConfig(env), /Cannot read selected configuration file/);
  await assert.rejects(loadConfig({ CODE_WORKER_CONFIG: '' }), /Cannot read/);
  await assert.rejects(loadConfig({ CODE_WORKER_CONFIG: directory }), /Cannot read/);
  await writeFile(path, '{private-marker');
  await assert.rejects(loadConfig(env), { message: 'Invalid configuration JSON' });
  for (const value of [null, [], 'private-marker', { 'private-marker': true }]) {
    await writeFile(path, JSON.stringify(value));
    await assert.rejects(loadConfig(env), (error) => !error.message.includes('private-marker'));
  }
  await writeFile(path, JSON.stringify({ model: 'file-model', think: true, timeoutMs: 500 }));
  assert.deepEqual(await loadConfig(env), { ...defaults, model: 'file-model', think: true, timeoutMs: 500 });
  assert.deepEqual(await loadConfig({ ...env, CODE_WORKER_MODEL: 'example-model', CODE_WORKER_THINK: 'false',
    CODE_WORKER_TIMEOUT_MS: '120000', CODE_WORKER_CONTEXT_TARGET: '4096', CODE_WORKER_ENDPOINT: 'https://example.invalid' }),
  { ...defaults, think: false, contextTarget: 4096, endpoint: 'https://example.invalid' });
  for (const [field, value] of [
    ['provider', 'other'], ['model', ''], ['model', 7], ['endpoint', 'not-a-url'],
    ['endpoint', 'file:///tmp/model'], ['endpoint', 'https://user:private-marker@example.invalid'],
    ['contextTarget', 0], ['contextTarget', -1], ['contextTarget', 1.5], ['contextTarget', '42'],
    ['contextTarget', Number.MAX_SAFE_INTEGER + 1], ['timeoutMs', 2147483648], ['timeoutMs', null], ['think', null], ['think', 'false'],
  ]) {
    await writeFile(path, JSON.stringify({ model: 'example-model', [field]: value }));
    await assert.rejects(loadConfig(env), { message: `Invalid configuration field: ${field}` });
  }
  await writeFile(path, JSON.stringify({ model: 7 }));
  assert.deepEqual(await loadConfig({ ...env, CODE_WORKER_MODEL: 'example-model' }), defaults);
});

test('environment overrides reject malformed numbers, booleans and empty values', async () => {
  for (const [key, values] of Object.entries({
    MODEL: ['', '  '], PROVIDER: ['', 'other'], ENDPOINT: ['', 'https://user:secret@example.invalid'],
    CONTEXT_TARGET: ['', ' ', '1.5', '-1', '0', 'Infinity', '1e3', '0x10'],
    TIMEOUT_MS: ['0', '2147483648'], THINK: ['', '0', 'False', 'yes'],
  })) {
    for (const value of values) {
      await assert.rejects(loadConfig({ CODE_WORKER_MODEL: 'example-model', [`CODE_WORKER_${key}`]: value }), /Invalid configuration field/);
    }
  }
});

test('example configuration loads without model capability inference', async () => {
  const config = await loadConfig({ CODE_WORKER_CONFIG: 'config.example.json' });
  assert.deepEqual(config, { ...defaults, model: 'REPLACE_WITH_YOUR_LOCAL_MODEL' });
});
