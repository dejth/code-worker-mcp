import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { OllamaProvider } from './providers/ollama.js';
import { createWorkerServer } from './tools.js';

async function main(): Promise<void> {
  const config = await loadConfig();
  const server = createWorkerServer(new OllamaProvider(config), config.model, config.maxInputBytes);
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    void server.close();
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Server startup failed');
  process.exitCode = 1;
});
