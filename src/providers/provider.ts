export type ProviderErrorCode =
  | 'invalid_input'
  | 'unsupported_capability'
  | 'timeout'
  | 'cancelled'
  | 'provider_error'
  | 'invalid_provider_response'
  | 'truncated';

export class ProviderError extends Error {
  constructor(public readonly code: ProviderErrorCode) {
    super(`Provider execution failed: ${code}`);
  }
}

export type GenerateRequest = { prompt: string; signal?: AbortSignal };
export type GenerateResult = {
  status: 'success';
  content: string;
  model: string;
  durationMs: number;
  truncated: false;
  warnings: string[];
};

export interface Provider {
  generate(request: GenerateRequest): Promise<GenerateResult>;
}
