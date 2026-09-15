# code-worker-mcp

An open-source MCP server for delegating bounded coding tasks to developer-selected local models.

```text
Primary AI agent -> code-worker-mcp -> configured provider -> local model
```

The primary agent owns planning, architecture, task decomposition, and final review. The worker will return proposals for supplied context. Ollama is the initial planned provider; no specific model is required.

## Current status

The local stdio MCP server, validated configuration, bounded Ollama execution, four proposal-only tools, Codex registration instructions, and an opt-in real-model smoke command are implemented.

The tools are `generate`, `review`, `refactor`, and `test`. They return unverified proposals or findings. The `test` tool proposes tests; it does not execute them.

## Development

Use the latest patch of [Node.js 24 LTS](https://nodejs.org/en/about/previous-releases) and its bundled npm. `.nvmrc` selects the Node.js 24 release line.

```sh
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

`npm test` compiles the source and uses Node.js's built-in test runner. Build output goes to `dist/`. CI runs all four checks on pull requests and pushes to `develop`, `release`, and `main`.

Validation does not require Ollama, a GPU, model downloads, or inference network access. Dependency installation requires npm registry access or a populated cache.

## Install and configure

```sh
git clone <repository-url>
cd code-worker-mcp
npm ci
npm run build
cp config.example.json config.local.json
```

Edit ignored `config.local.json` and replace `REPLACE_WITH_YOUR_LOCAL_MODEL` with an already installed model. `code-worker-mcp` never issues a model-download request. Validate the file without contacting Ollama:

```sh
CODE_WORKER_CONFIG=./config.local.json node --input-type=module -e 'import { loadConfig } from "./dist/config.js"; await loadConfig(); console.error("Configuration is valid");'
```

## Privacy and configuration

The server reads only its explicitly selected configuration file. Tools do not inspect the working directory, write files, execute commands, apply patches, or mutate Git. Development build and test commands are separate from worker functionality.

Tools send only the task and context supplied in their arguments to the configured provider. Model output is untrusted and is returned without claims that code compiles or tests pass. No telemetry or remote fallback is implemented.

Machine-local configuration belongs in ignored `config.local.json`, `.env`, or `.local/`. Never commit credentials, private code/context, logs, or model files.

## Configuration loader

`loadConfig(env = process.env)` in `src/config.ts` loads and validates settings before the MCP server starts. Precedence is **environment overrides > selected JSON file > defaults**, applied per field. Unknown JSON keys are rejected; known fields are validated after overrides.

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

The example model value is a placeholder, not a recommendation.

The Ollama provider checks `/api/show` capability metadata before generation. If the model reports `thinking`, omitted `think` sends `false`; an explicit boolean is sent as configured. Any explicit `think` value for a model that does not report the capability fails as unsupported. No model-name guessing is used.

Generation uses `/api/generate` with `stream: false` and `options.num_ctx` set to `contextTarget`. `maxInputBytes` rejects oversized UTF-8 prompts before any request. `maxOutputBytes` bounds response reading even when HTTP delivers multiple chunks. Timeout and caller cancellation abort both metadata and generation requests. Redirects are rejected so supplied context cannot be silently forwarded to another endpoint. Incomplete generation, `done_reason: "length"`, and oversized response bodies are reported as truncation and never as successful output.

Provider errors expose only normalized categories: invalid input, unsupported capability, timeout, cancellation, provider error, invalid provider response, or truncation. Raw provider bodies and request values are not included. Non-loopback endpoints are permitted and send prompts off-machine when a tool is called.

## MCP server and tools

Build first, select configuration, then run the stdio server. Stdout is reserved for MCP protocol messages; startup errors go to stderr. `SIGINT` and `SIGTERM` close the server. The current MCP SDK forwards client cancellation to the active provider request; disconnect behavior is covered more fully by Issue #7.

```sh
npm run build
CODE_WORKER_CONFIG=./config.local.json npm start
```

The implementation uses `@modelcontextprotocol/sdk` 1.30 and its current `registerTool` API with explicit Zod schemas. The shapes below show minimal `arguments` values for `tools/call`; the surrounding JSON-RPC request is supplied by the MCP client.

```json
{"name":"generate","arguments":{"task":"Add input validation","context":"export function parse(value: string) {}"}}
{"name":"review","arguments":{"task":"Find correctness defects","code":"export const divide = (a, b) => a / b"}}
{"name":"refactor","arguments":{"task":"Remove duplication without changing behavior","code":"const a = x + 1; const b = x + 1"}}
{"name":"test","arguments":{"task":"Cover empty and malformed input","code":"export function parse(value: string) {}"}}
```

`task` and `code` must be nonempty. `generate.context` is optional; no repository content is attached automatically. The complete provider prompt must fit `maxInputBytes`, otherwise the tool returns `invalid_input` before provider execution.

Successful and failed tools return the same structured fields: `status`, `content`, `model`, `truncated`, `warnings`, and `durationMs` when available. Failed calls set MCP `isError`; truncation remains an error with `truncated: true`. Prompts differ by task: review asks for findings, refactor requires behavior preservation, and test explicitly forbids execution or pass claims.

## Codex setup

This is the only client setup currently verified. The example follows the [official Codex MCP documentation](https://developers.openai.com/codex/mcp/) for local STDIO servers and was checked with `codex-cli 0.146.0` on 2026-09-15 using an isolated config: `codex mcp add` wrote the expected command, argument, and redacted environment entry, and `codex mcp list` reported the server enabled.

Build the project, then use absolute paths for Node.js, the built server, and local config:

```sh
codex mcp add code-worker \
  --env CODE_WORKER_CONFIG=/absolute/path/to/code-worker-mcp/config.local.json \
  -- /absolute/path/to/node /absolute/path/to/code-worker-mcp/dist/server.js
codex mcp list
```

Codex CLI, the IDE extension, and the ChatGPT desktop app on the same Codex host share MCP configuration. Restart the client after adding the server; use `/mcp` to inspect it. The equivalent `config.toml` entry is:

```toml
[mcp_servers.code-worker]
command = "/absolute/path/to/node"
args = ["/absolute/path/to/code-worker-mcp/dist/server.js"]
tool_timeout_sec = 130

[mcp_servers.code-worker.env]
CODE_WORKER_CONFIG = "/absolute/path/to/code-worker-mcp/config.local.json"
```

Keep Codex `tool_timeout_sec` longer than the worker's `timeoutMs` so provider timeouts return the worker's normalized `timeout` result before the client cancels the call. The official default is 60 seconds; the example pairs 130 seconds with the worker's 120-second default.

## Optional real Ollama smoke test

The smoke command is deliberately excluded from normal CI. It requires an explicitly selected config or model, calls the configured Ollama endpoint once with synthetic code-generation text, and never downloads a model or sends repository content. It has a 150-second client cap in addition to the configured provider timeout.

```sh
CODE_WORKER_CONFIG=./config.local.json npm run smoke
```

Success prints only status, model, duration, response byte count, and warnings; model output is not logged. A failed command reports a normalized status where available. This checks connectivity and response shape, not code quality, compilation, or test execution.

## Troubleshooting

- `Invalid configuration field: model`: set `model` in the selected JSON file or `CODE_WORKER_MODEL`.
- `Cannot read selected configuration file`: `CODE_WORKER_CONFIG` must point to a readable JSON file; relative paths use the MCP process working directory.
- `provider_error`: confirm Ollama is running, the endpoint is correct, the model is installed, and a redirect/proxy is not intercepting the request.
- `unsupported_capability`: remove explicit `think` for a model that does not report the `thinking` capability.
- `timeout` or client cancellation: increase the worker timeout only when local inference needs it, then keep the client tool timeout slightly longer.
- `truncated`: raise `maxOutputBytes` if the HTTP body limit was reached; model length truncation may require a different model/context setup.
- Codex does not show the tools: run `npm run build`, use absolute paths, run `codex mcp list`, then restart the client and inspect `/mcp`.
- A non-loopback endpoint sends the task and supplied code/context to that configured host. Verify ownership and transport security before using it.

## Verification boundaries

The deterministic integration test starts the built stdio server with the official MCP client and a loopback fake Ollama endpoint. It verifies initialization, discovery, all four calls, timeout, client cancellation and recovery, malformed/oversized/truncated provider responses, pre-transmission input limits, clean shutdown, protocol parsing, redacted diagnostics, and an unchanged temporary workspace. Normal CI uses no external network or real model.

The current runtime source was also checked for write and command-execution paths: `src/config.ts` only reads the explicitly selected configuration file, and `src/providers/ollama.ts` only uses `fetch` with redirects disabled. Runtime source contains no filesystem-write, child-process, shell, or Git API. This evidence covers current code and tested behavior; it is not a security certification or a claim about model output quality.

## Contributing

GitHub Issues define accepted scope. Start a `tasks/<issue>-<description>` branch from `develop` and open its PR against `develop`. Promote reviewed changes through PRs in this order:

```text
tasks/* -> develop -> release -> main
```

Run all four validation commands before submitting a PR. Describe the change, privacy/security impact, actual validation, and limitations. Branch promotion does not deploy or publish the project. See [AGENTS.md](AGENTS.md) for the full project rules.
