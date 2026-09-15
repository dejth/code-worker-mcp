import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';

test('server validates configuration before starting and keeps stdout protocol-only', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../dist/server.js', import.meta.url))], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Invalid configuration field: model/);
});

test('optional smoke command refuses to infer a model', () => {
  const result = spawnSync(process.execPath, ['scripts/smoke.mjs'], { encoding: 'utf8', timeout: 5_000, env: {} });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /requires CODE_WORKER_CONFIG or CODE_WORKER_MODEL/);
});
