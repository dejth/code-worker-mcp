import type { Config } from '../config.js';
import { ProviderError, type GenerateRequest, type GenerateResult, type Provider } from './provider.js';

type Fetch = typeof fetch;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readJson(response: Response, limit: number, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new ProviderError('invalid_provider_response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ProviderError('truncated');
      }
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (signal.aborted) throw error;
    throw new ProviderError('invalid_provider_response');
  }
}

export class OllamaProvider implements Provider {
  constructor(private readonly config: Config, private readonly request: Fetch = fetch) {}

  async generate({ prompt, signal }: GenerateRequest): Promise<GenerateResult> {
    if (Buffer.byteLength(prompt) > this.config.maxInputBytes) throw new ProviderError('invalid_input');
    if (signal?.aborted) throw new ProviderError('cancelled');
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), this.config.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
    const started = performance.now();
    try {
      const show = await this.call('/api/show', { model: this.config.model }, combined);
      if (!object(show) || !Array.isArray(show.capabilities) || !show.capabilities.every((item) => typeof item === 'string')) {
        throw new ProviderError('invalid_provider_response');
      }
      const supportsThinking = show.capabilities.includes('thinking');
      if (this.config.think !== undefined && !supportsThinking) {
        throw new ProviderError('unsupported_capability');
      }
      const think = supportsThinking ? (this.config.think ?? false) : undefined;
      const generated = await this.call('/api/generate', {
        model: this.config.model,
        prompt,
        stream: false,
        options: { num_ctx: this.config.contextTarget },
        ...(think === undefined ? {} : { think }),
      }, combined);
      if (!object(generated) || generated.model !== this.config.model || typeof generated.response !== 'string'
        || typeof generated.done !== 'boolean'
        || (generated.done_reason !== undefined && typeof generated.done_reason !== 'string')) {
        throw new ProviderError('invalid_provider_response');
      }
      if (!generated.done || generated.done_reason === 'length') throw new ProviderError('truncated');
      return { status: 'success', content: generated.response, model: generated.model,
        durationMs: Math.round(performance.now() - started), truncated: false, warnings: [] };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (timeout.signal.aborted) throw new ProviderError('timeout');
      if (signal?.aborted) throw new ProviderError('cancelled');
      throw new ProviderError('provider_error');
    } finally {
      clearTimeout(timer);
    }
  }

  private async call(path: string, body: object, signal: AbortSignal): Promise<unknown> {
    let response: Response;
    try {
      response = await this.request(new URL(path, `${this.config.endpoint}/`), {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal, redirect: 'manual',
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new ProviderError('provider_error');
    }
    if (response.status >= 300 && response.status < 400) throw new ProviderError('provider_error');
    if (!response.ok) throw new ProviderError('provider_error');
    return readJson(response, this.config.maxOutputBytes, signal);
  }
}
