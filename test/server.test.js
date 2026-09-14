import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';

test('bootstrap exits clearly without writing protocol output', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../dist/server.js', import.meta.url))], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /MCP server is not implemented yet/);
});
