# code-worker-mcp

A planned open-source MCP server for delegating bounded coding tasks to developer-selected local models.

```text
Primary AI agent -> code-worker-mcp -> configured provider -> local model
```

The primary agent owns planning, architecture, task decomposition, and final review. The worker will return proposals for supplied context. Ollama is the initial planned provider; no specific model is required.

## Current status

Only TypeScript tooling, a placeholder entry point, and CI are implemented. Running `node dist/server.js` prints an explanation to stderr and exits with status 1; it does not start an MCP server.

The planned tools are `generate`, `review`, `refactor`, and `test`. The `test` tool will propose tests, not execute them. Provider configuration, client registration, tool examples, timeouts, and an optional Ollama smoke test will be documented when implemented. There is currently no supported MCP client installation flow.

## Development

Use the latest patch of [Node.js 24 LTS](https://nodejs.org/en/about/previous-releases) and its bundled npm. `.nvmrc` selects the Node.js 24 release line.

```sh
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

`npm test` compiles the source and uses Node.js's built-in test runner to check the placeholder process. Build output goes to `dist/`. CI runs all four checks on pull requests and pushes to `develop`, `release`, and `main`.

Validation does not require Ollama, a GPU, model downloads, or inference network access. Dependency installation requires npm registry access or a populated cache.

## Privacy and configuration

The current entry point does not read repository context, write files, execute commands, or contact a provider. Development build and test commands are separate from worker functionality.

Future tools will send only caller-supplied context to the configured provider and return proposals without applying them. A non-loopback provider endpoint may send code off the machine. No telemetry or remote fallback is planned.

Machine-local configuration belongs in ignored `config.local.json`, `.env`, or `.local/`; configuration loading is not implemented yet. Never commit credentials, private code/context, logs, or model files.

## Contributing

GitHub Issues define accepted scope. Start a `tasks/<issue>-<description>` branch from `develop` and open its PR against `develop`. Promote reviewed changes through PRs in this order:

```text
tasks/* -> develop -> release -> main
```

Run all four validation commands before submitting a PR. Describe the change, privacy/security impact, actual validation, and limitations. Branch promotion does not deploy or publish the project. See [AGENTS.md](AGENTS.md) for the full project rules.
