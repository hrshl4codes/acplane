# acplane

A transparent proxy for coding agents that records what they actually do.

`acplane` sits between an ACP-compatible editor and the coding agent behind it.
You point your editor at `acplane` instead of at the harness directly. It
launches the real harness, passes every message through untouched, and writes
the full exchange to a JSONL flight log. The agent behaves exactly as it would
without the proxy in the middle, but now every session leaves a record you own.

It speaks the [Agent Client Protocol (ACP)](https://agentclientprotocol.com/),
so it works with any ACP client and any ACP harness without per-tool
integration.

## Why this exists

Coding agents keep their logs inside their own state directories, in whatever
shape each vendor chose, and the agent can rewrite those logs as it runs. Once a
session ends, questions like "which files did this agent read before it edited
that one" or "what did it ask permission to do" are hard to answer and easy to
lose.

Recording at the protocol boundary changes that. Because every prompt, response,
tool call, and permission request crosses the wire between editor and harness,
`acplane` captures a complete and neutral account of the session from outside the
agent's reach. It adds nothing to the model's context and consumes no tokens:
messages are forwarded byte for byte.

Observation is designed to fail open. If the recorder cannot write, it reports
the problem and keeps forwarding traffic. A broken flight recorder never grounds
the plane.

## How it works

```
  ACP client                    acplane                     harness
 (Zed, etc.)                                          (Claude Code, Codex)
      |                            |                           |
      |  ---- JSON-RPC (stdio) --> |  ---- forwarded as-is --> |
      |                         [ record ]                     |
      |  <-- forwarded as-is ----- |  <---- JSON-RPC (stdio) - |
      |                            |                           |
                                   v
                     ~/.acplane/sessions/<id>.jsonl
```

## Requirements

- Node.js 20.19 or newer
- An ACP-compatible client and harness

The maintained Claude ACP adapter used below requires Node.js 22 or newer.
This is an adapter requirement; acplane itself continues to support Node.js
20.19 and newer.

## Quickstart

Install dependencies and build the executable:

```sh
npm install
npm run build
```

Create `~/.acplane/config.yaml` and describe the harness you want to record:

```yaml
defaultHarness: claude
harnesses:
  claude:
    command: npx
    args:
      - "-y"
      - "@agentclientprotocol/claude-agent-acp"
  codex:
    command: npx
    args:
      - "-y"
      - "@agentclientprotocol/codex-acp"
```

Both entries launch ACP adapters that wrap the underlying agent CLI, since the
agents do not speak ACP over stdio on their own. `acplane` itself is
harness-agnostic: it proxies and records whatever ACP-compatible command a
harness entry points at, so adding another agent is a matter of configuration,
not code.

Point your ACP client at `node /absolute/path/to/acplane/bin/acplane.mjs`. In
Zed, add an agent server to `settings.json`:

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

Use the agent as you normally would. Recordings land in
`~/.acplane/sessions/<session-id>.jsonl`, one file per session.

To record a different harness or point at another config file, pass flags when
launching:

```sh
node bin/acplane.mjs --harness codex --config /path/to/acplane.yaml
```

Normalize recorded sessions into the default local SQLite index:

```sh
node bin/acplane.mjs index
```

Use `--sessions <directory>` to select another recordings directory,
`--db <path>` to select another database, or pass individual `.jsonl` files.

## What a recording looks like

Each line is one message, tagged with a direction and a timestamp, with the
original wire text preserved verbatim:

```json
{"ts":"2026-08-08T11:41:24.942Z","direction":"client->harness","raw":"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}"}
```

## Project status

The recording and normalization foundations work and are tested end to end.
Building on top of them: file-level lineage across harnesses, a uniform policy
layer that enforces the same rules regardless of which agent is running, and a
local dashboard to explore it all.

## Development

```sh
npm test        # unit and end-to-end proxy tests
npm run typecheck
npm run build
```

The suite includes a deterministic ACP-shaped harness, a full proxy-to-SQLite
flow, and sanitized regression fixtures captured from real Claude and Codex
sessions.

## License

Apache-2.0
