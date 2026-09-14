# code-worker-mcp

A planned open-source MCP server for delegating bounded coding tasks to developer-selected local models.

```text
Primary AI agent -> code-worker-mcp -> configured provider -> local model
```

The primary agent owns planning, architecture, task decomposition, and final review. The worker will return proposals for supplied context. Ollama is the initial planned provider; no specific model is required.

## Current status

TypeScript tooling, a validated configuration loader, bounded Ollama execution, a placeholder entry point, and CI are implemented. Running `node dist/server.js` prints an explanation to stderr and exits with status 1; it does not start an MCP server or call Ollama.

The planned tools are `generate`, `review`, `refactor`, and `test`. The `test` tool will propose tests, not execute them. MCP wiring, client registration, tool examples, and an optional Ollama smoke test will be documented when implemented. There is currently no supported MCP client installation flow.

## Development

Use the latest patch of [Node.js 24 LTS](https://nodejs.org/en/about/previous-releases) and its bundled npm. `.nvmrc` selects the Node.js 24 release line.

```sh
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

`npm test` compiles the source and uses Node.js's built-in test runner to check configuration loading and the placeholder process. Build output goes to `dist/`. CI runs all four checks on pull requests and pushes to `develop`, `release`, and `main`.

Validation does not require Ollama, a GPU, model downloads, or inference network access. Dependency installation requires npm registry access or a populated cache.

## Privacy and configuration

The current entry point does not read repository context, write files, execute commands, or contact a provider. The Ollama provider is a library called only by tests today. Development build and test commands are separate from worker functionality.

Future tools will send only caller-supplied context to this provider and return proposals without applying them. No telemetry or remote fallback is implemented.

Machine-local configuration belongs in ignored `config.local.json`, `.env`, or `.local/`. Never commit credentials, private code/context, logs, or model files.

## Configuration loader

`loadConfig(env = process.env)` in `src/config.ts` loads and validates settings. The placeholder server does not call it yet; no MCP or inference is started. Precedence is **environment overrides > selected JSON file > defaults**, applied per field. Unknown JSON keys are rejected; known fields are validated after overrides.

| JSON field | Environment variable | Default / constraint |
| --- | --- | --- |
| File selection (not a JSON field) | `CODE_WORKER_CONFIG` | Optional explicit path; no automatic file search |
| `provider` | `CODE_WORKER_PROVIDER` | `ollama` only |
| `model` | `CODE_WORKER_MODEL` | Required nonempty string; no inferred model |
| `endpoint` | `CODE_WORKER_ENDPOINT` | `http://127.0.0.1:11434`; HTTP(S), no URL credentials |
| `contextTarget` | `CODE_WORKER_CONTEXT_TARGET` | `16384`; positive safe integer |
| `timeoutMs` | `CODE_WORKER_TIMEOUT_MS` | `120000`; integer from 1 to 2147483647 (Node timer range) |
| `maxInputBytes` | `CODE_WORKER_MAX_INPUT_BYTES` | `1048576`; positive safe integer |
| `maxOutputBytes` | `CODE_WORKER_MAX_OUTPUT_BYTES` | `1048576`; positive safe integer |
| `think` | `CODE_WORKER_THINK` | Unspecified; JSON boolean or exact env `true`/`false` |

Numeric environment values accept decimal digits only. Empty values are invalid, not a request for defaults. An explicitly selected file must be readable and contain a JSON object, even if environment variables supply all settings. Relative paths resolve from the process working directory. `.env` files are not automatically loaded.

Copy `config.example.json` to ignored `config.local.json` and replace `REPLACE_WITH_YOUR_LOCAL_MODEL` with your installed model name. The placeholder is not a model recommendation. After building, inspect loading without contacting a provider:

```sh
CODE_WORKER_CONFIG=./config.local.json node --input-type=module -e 'import { loadConfig } from "./dist/config.js"; await loadConfig(); console.error("Configuration is valid");'
```

The Ollama provider checks `/api/show` capability metadata before generation. If the model reports `thinking`, omitted `think` sends `false`; an explicit boolean is sent as configured. Any explicit `think` value for a model that does not report the capability fails as unsupported. No model-name guessing is used.

Generation uses `/api/generate` with `stream: false` and `options.num_ctx` set to `contextTarget`. `maxInputBytes` rejects oversized UTF-8 prompts before any request. `maxOutputBytes` bounds response reading even when HTTP delivers multiple chunks. Timeout and caller cancellation abort both metadata and generation requests. Redirects are rejected so supplied context cannot be silently forwarded to another endpoint. Incomplete generation, `done_reason: "length"`, and oversized response bodies are reported as truncation and never as successful output.

Provider errors expose only normalized categories: invalid input, unsupported capability, timeout, cancellation, provider error, invalid provider response, or truncation. Raw provider bodies and request values are not included. Non-loopback endpoints are permitted and will send prompts off-machine when the provider is called. The placeholder server still does not load configuration, start MCP, or run inference; Issue #6 will wire tools to this provider.

## Contributing

GitHub Issues define accepted scope. Start a `tasks/<issue>-<description>` branch from `develop` and open its PR against `develop`. Promote reviewed changes through PRs in this order:

```text
tasks/* -> develop -> release -> main
```

Run all four validation commands before submitting a PR. Describe the change, privacy/security impact, actual validation, and limitations. Branch promotion does not deploy or publish the project. See [AGENTS.md](AGENTS.md) for the full project rules.
