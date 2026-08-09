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

Each line is one message, tagged with a direction and a timestamp. The `raw`
field contains the wire text after secret redaction:

```json
{"ts":"2026-08-08T11:41:24.942Z","direction":"client->harness","raw":"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}"}
```

## Policy and permissions

When a harness sends an ACP `session/request_permission` request, `acplane`
evaluates its policy and can answer on the editor's behalf:

- `deny` rejects the request without interrupting the editor.
- `allow` approves the request without interrupting the editor.
- `escalate` forwards the request to the editor for a human decision.

Rules use first-match-wins evaluation over the tool-call `kind`, file `path`
globs, and `command` globs. If no policy file is found, the built-in rules deny
changes to secrets, git internals, and CI workflows. They escalate commands that
pipe a network download into a shell, as well as requests that match no rule.

Copy `acplane.policy.example.yaml` to `./acplane.policy.yaml` to customize the
defaults, or pass `--policy <path>`. A `policy` path in `acplane.yaml` also works.
Each permission response is recorded, including whether policy or a human made
the decision and which policy rule matched. Indexing the recording writes these
details to the `permission_event` table.

If evaluating a permission request throws, `acplane` forwards the request to the
editor instead of choosing a decision. An invalid policy file prevents startup.

## Secret redaction

Session recordings are redacted at rest. Tokens matching high-confidence
Anthropic, OpenAI, GitHub, AWS access key ID, and bearer credential formats are
replaced with `[REDACTED]` before a log line is written. Redaction does not
change the bytes forwarded to the harness or editor.

## Launch profiles

Policy can act only on permission requests sent by the harness. A harness in a
fully automatic mode does not ask permission, so there is nothing to intercept.
Configure the harness adapter through its `args` in `acplane.yaml` so it asks
permission for the actions you want policy to handle.

Those launch flags are adapter-specific and still need confirmation against the
real adapter and version in use. The quickstart entries above show how to start
the adapters; they do not claim a particular permission profile.

## Project status

Recording, normalization, permission policy, and at-rest redaction work and are
tested end to end. A local dashboard for exploring indexed sessions is not yet
included.

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
