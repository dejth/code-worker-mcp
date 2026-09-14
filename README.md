# code-worker-mcp

A planned open-source MCP server for delegating bounded coding tasks to developer-selected local models.

```text
Primary AI agent -> code-worker-mcp -> configured provider -> local model
```

The primary agent owns planning, architecture, task decomposition, and final review. The worker will return proposals for supplied context. Ollama is the initial planned provider; no specific model is required.

## Current status

TypeScript tooling, a validated configuration loader, a placeholder entry point, and CI are implemented. Running `node dist/server.js` prints an explanation to stderr and exits with status 1; it does not start an MCP server.

The planned tools are `generate`, `review`, `refactor`, and `test`. The `test` tool will propose tests, not execute them. Provider execution, client registration, tool examples, timeout enforcement, and an optional Ollama smoke test will be documented when implemented. There is currently no supported MCP client installation flow.

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

The current entry point does not read repository context, write files, execute commands, or contact a provider. Development build and test commands are separate from worker functionality.

Future tools will send only caller-supplied context to the configured provider and return proposals without applying them. A non-loopback provider endpoint may send code off the machine. No telemetry or remote fallback is planned.

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
| `think` | `CODE_WORKER_THINK` | Unspecified; JSON boolean or exact env `true`/`false` |

Numeric environment values accept decimal digits only. Empty values are invalid, not a request for defaults. An explicitly selected file must be readable and contain a JSON object, even if environment variables supply all settings. Relative paths resolve from the process working directory. `.env` files are not automatically loaded.

Copy `config.example.json` to ignored `config.local.json` and replace `REPLACE_WITH_YOUR_LOCAL_MODEL` with your installed model name. The placeholder is not a model recommendation. After building, inspect loading without contacting a provider:

```sh
CODE_WORKER_CONFIG=./config.local.json node --input-type=module -e 'import { loadConfig } from "./dist/config.js"; await loadConfig(); console.error("Configuration is valid");'
```

An omitted `think` remains unspecified for later capability handling; the loader does not guess support or send a setting to a model. Non-loopback endpoints are permitted and may send code off-machine once provider execution is implemented. Errors report a field or file-failure category without echoing values, paths, or file contents. These settings are validated only; capability checks and runtime limit enforcement belong to subsequent work.

## Contributing

GitHub Issues define accepted scope. Start a `tasks/<issue>-<description>` branch from `develop` and open its PR against `develop`. Promote reviewed changes through PRs in this order:

```text
tasks/* -> develop -> release -> main
```

Run all four validation commands before submitting a PR. Describe the change, privacy/security impact, actual validation, and limitations. Branch promotion does not deploy or publish the project. See [AGENTS.md](AGENTS.md) for the full project rules.
