import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';

const workerEnv = Object.fromEntries(Object.entries(process.env)
  .filter(([name, value]) => name.startsWith('CODE_WORKER_') && value !== undefined));

if (!workerEnv.CODE_WORKER_CONFIG && !workerEnv.CODE_WORKER_MODEL) {
  console.error('Smoke test requires CODE_WORKER_CONFIG or CODE_WORKER_MODEL.');
  process.exitCode = 1;
} else {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve('dist/server.js')],
    cwd: process.cwd(),
    env: workerEnv,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'code-worker-smoke', version: '0.0.0' });
  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: 'generate',
      arguments: { task: 'Return a minimal JavaScript function named add that adds two numbers. Do not use external packages.' },
    }, undefined, { timeout: 150000, signal: AbortSignal.timeout(150000) });
    const output = result.structuredContent;
    if (result.isError || !output || output.status !== 'success' || typeof output.content !== 'string' || output.content.length === 0) {
      throw new Error(`Smoke test failed: ${output?.status ?? 'invalid_result'}`);
    }
    console.log(JSON.stringify({ status: output.status, model: output.model, durationMs: output.durationMs,
      contentBytes: Buffer.byteLength(output.content), warnings: output.warnings }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Smoke test failed');
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}
