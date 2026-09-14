import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

export type Config = {
  provider: 'ollama';
  model: string;
  endpoint: string;
  contextTarget: number;
  timeoutMs: number;
  think?: boolean;
};

const variables = {
  provider: 'CODE_WORKER_PROVIDER',
  model: 'CODE_WORKER_MODEL',
  endpoint: 'CODE_WORKER_ENDPOINT',
  contextTarget: 'CODE_WORKER_CONTEXT_TARGET',
  timeoutMs: 'CODE_WORKER_TIMEOUT_MS',
  think: 'CODE_WORKER_THINK',
} as const;

function invalid(field: keyof Config): never {
  throw new Error(`Invalid configuration field: ${field}`);
}

export async function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Config> {
  let file: Record<string, unknown> = {};
  if (env.CODE_WORKER_CONFIG !== undefined) {
    let contents: string;
    try {
      contents = await readFile(env.CODE_WORKER_CONFIG, 'utf8');
    } catch {
      throw new Error('Cannot read selected configuration file');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch {
      throw new Error('Invalid configuration JSON');
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Configuration must be a JSON object');
    }
    if (Object.keys(parsed).some((key) => !Object.hasOwn(variables, key))) {
      throw new Error('Unknown configuration field');
    }
    file = parsed as Record<string, unknown>;
  }

  const values: Record<string, unknown> = {
    provider: 'ollama',
    endpoint: 'http://127.0.0.1:11434',
    contextTarget: 16384,
    timeoutMs: 120000,
    ...file,
  };
  for (const [field, variable] of Object.entries(variables)) {
    const value = env[variable];
    if (value === undefined) continue;
    if (field === 'contextTarget' || field === 'timeoutMs') {
      if (!/^\d+$/.test(value)) invalid(field);
      values[field] = Number(value);
    } else if (field === 'think') {
      if (value !== 'true' && value !== 'false') invalid(field);
      values[field] = value === 'true';
    } else {
      values[field] = value;
    }
  }

  const { provider, model, endpoint, contextTarget, timeoutMs, think } = values;
  if (provider !== 'ollama') invalid('provider');
  if (typeof model !== 'string' || model.trim() === '') invalid('model');
  if (typeof endpoint !== 'string' || endpoint.trim() !== endpoint) invalid('endpoint');
  try {
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      invalid('endpoint');
    }
  } catch {
    invalid('endpoint');
  }
  if (typeof contextTarget !== 'number' || !Number.isSafeInteger(contextTarget) || contextTarget <= 0) {
    invalid('contextTarget');
  }
  if (typeof timeoutMs !== 'number' || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) {
    invalid('timeoutMs');
  }
  if (think !== undefined && typeof think !== 'boolean') invalid('think');
  return { provider, model, endpoint, contextTarget, timeoutMs, ...(think === undefined ? {} : { think }) };
}
