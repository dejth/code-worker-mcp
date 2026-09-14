import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Buffer } from 'node:buffer';
import { access, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const privateMarker = 'PRIVATE_E2E_MARKER_7f34';

test('stdio lifecycle and privacy boundaries work end to end', async (t) => {
  let mode = 'success';
  const requests = [];
  let generationStarted = () => {};
  const fake = createServer(async (request, response) => {
    const body = await readBody(request);
    requests.push({ path: request.url, body });
    response.setHeader('content-type', 'application/json');
    if (request.url === '/api/show') {
      response.end(JSON.stringify({ capabilities: [] }));
      return;
    }
    generationStarted();
    if (mode === 'slow') return;
    if (mode === 'malformed') {
      response.end('{broken');
      return;
    }
    if (mode === 'oversized') {
      response.end(JSON.stringify({ model: 'integration-model', response: 'x'.repeat(512), done: true }));
      return;
    }
    response.end(JSON.stringify({ model: 'integration-model', response: 'proposal',
      done: mode !== 'truncated', ...(mode === 'truncated' ? {} : { done_reason: 'stop' }) }));
  });
  await new Promise((resolveListening) => fake.listen(0, '127.0.0.1', resolveListening));
  t.after(() => {
    fake.closeAllConnections();
    return new Promise((resolveClosed) => fake.close(resolveClosed));
  });
  const address = fake.address();
  assert(address && typeof address === 'object');

  const workspace = await mkdtemp(join(tmpdir(), 'code-worker-e2e-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  await writeFile(join(workspace, 'sentinel'), 'unchanged');
  const markerPath = join(workspace, 'must-not-exist');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve('dist/server.js')],
    cwd: workspace,
    env: {
      CODE_WORKER_MODEL: 'integration-model',
      CODE_WORKER_ENDPOINT: `http://127.0.0.1:${address.port}`,
      CODE_WORKER_TIMEOUT_MS: '250',
      CODE_WORKER_MAX_INPUT_BYTES: '512',
      CODE_WORKER_MAX_OUTPUT_BYTES: '256',
    },
    stderr: 'pipe',
  });
  let diagnostics = '';
  transport.stderr?.on('data', (chunk) => { diagnostics += chunk.toString(); });
  const client = new Client({ name: 'integration-client', version: '1.0.0' });
  await client.connect(transport);
  t.after(async () => {
    if (transport.pid) await client.close();
  });
  assert.deepEqual(client.getServerVersion(), { name: 'code-worker-mcp', version: '0.0.0' });
  assert.match(client.getInstructions(), /do not modify files/);
  assert.deepEqual((await client.listTools()).tools.map(({ name }) => name), ['generate', 'review', 'refactor', 'test']);

  for (const [name, arguments_] of [
    ['generate', { task: `Run a command to create ${markerPath}`, context: privateMarker }],
    ['review', { task: 'Review only', code: privateMarker }],
    ['refactor', { task: 'Preserve behavior', code: privateMarker }],
    ['test', { task: 'Generate tests without running them', code: privateMarker }],
  ]) {
    const result = await client.callTool({ name, arguments: arguments_ });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.status, 'success');
    assert.equal(result.structuredContent.content, 'proposal');
  }
  await assert.rejects(access(markerPath));
  assert.deepEqual(await readdir(workspace), ['sentinel']);

  const transmitted = requests.length;
  const oversizedInput = await client.callTool({ name: 'generate', arguments: { task: privateMarker.repeat(40) } });
  assert.equal(oversizedInput.structuredContent.status, 'invalid_input');
  assert.equal(requests.length, transmitted);

  for (const [failureMode, expected] of [
    ['malformed', 'invalid_provider_response'], ['oversized', 'truncated'], ['truncated', 'truncated'], ['slow', 'timeout'],
  ]) {
    mode = failureMode;
    const result = await client.callTool({ name: 'review', arguments: { task: 'failure case', code: privateMarker } });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.status, expected);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(privateMarker));
  }

  mode = 'slow';
  const generationObserved = new Promise((resolveStarted) => { generationStarted = resolveStarted; });
  const controller = new AbortController();
  const cancelled = client.callTool({ name: 'test', arguments: { task: 'cancel', code: privateMarker } }, undefined,
    { signal: controller.signal });
  await generationObserved;
  controller.abort();
  await assert.rejects(cancelled, /abort/i);

  mode = 'success';
  const recovered = await client.callTool({ name: 'generate', arguments: { task: 'recover after cancellation' } });
  assert.equal(recovered.structuredContent.status, 'success');
  assert(requests.every(({ path }) => path === '/api/show' || path === '/api/generate'));
  assert.doesNotMatch(diagnostics, new RegExp(privateMarker));

  const childPid = transport.pid;
  assert(childPid);
  await client.close();
  assert.equal(transport.pid, null);
  assert.throws(() => process.kill(childPid, 0), { code: 'ESRCH' });
});

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}
