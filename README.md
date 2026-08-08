# acplane

`acplane` is a transparent [Agent Client Protocol (ACP)](https://agentclientprotocol.com/)
proxy for coding agents. Point an ACP-compatible editor at `acplane` instead of
the underlying harness; `acplane` launches that harness, forwards every message
without re-serializing it, and records the exchange as a JSONL flight log.

The recording layer is the foundation for session analysis, file-level lineage,
policy enforcement, and a local dashboard.

## Why

Harness logs live inside harness-owned state directories. Recording at the
protocol boundary provides a neutral account of prompts, responses, tool calls,
and permission requests without adding content to the agent context.

Observation is fail-open: recorder and tap failures are reported without
interrupting traffic between the client and harness.

## Requirements

- Node.js 20.11 or newer
- An ACP-compatible client and harness

## Quickstart

Install dependencies and build the executable:

```sh
npm install
npm run build
```

Create `~/.acplane/config.yaml`:

```yaml
defaultHarness: claude
harnesses:
  claude:
    command: npx
    args:
      - "@agentclientprotocol/claude-agent-acp"
```

Configure your ACP client to launch `node /absolute/path/to/acplane/bin/acplane.mjs`.
For Zed, add an agent server to `settings.json`:

```json
{
  "agent_servers": {
    "Claude via acplane": {
      "command": "node",
      "args": ["/absolute/path/to/acplane/bin/acplane.mjs"]
    }
  }
}
```

Use the agent normally. Session recordings are written to
`~/.acplane/sessions/<session-id>.jsonl`.

Select another configured harness or configuration file when launching the
proxy:

```sh
node bin/acplane.mjs --harness codex --config /path/to/acplane.yaml
```

## Development

```sh
npm test
npm run typecheck
npm run build
```

The test suite includes a deterministic ACP-shaped harness and an end-to-end
proxy recording flow.
