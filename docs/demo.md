# Where acplane sits

These tools observe different protocol boundaries, and their records can
overlap. What each tool sees depends on the traffic or instrumentation available
at that boundary.

| Layer | Examples | What it sees |
| --- | --- | --- |
| Model API boundary | Model gateways | Model requests and responses. Stored payloads may include prompts and tool-call intent, but not necessarily the complete editor-agent exchange or confirmed local effects. |
| MCP boundary | MCP clients, servers, and proxies | Agent-to-tool context and tool calls |
| A2A boundary | A2A clients, servers, and proxies | Agent-to-agent tasks and messages |
| UI and workflow | Session managers | Visibility depends on which protocols a session manager reads and what it records. |
| Application instrumentation | Tracing platforms | Telemetry emitted by instrumented application code |
| **ACP session boundary** | **acplane** | **ACP-emitted prompts, tool-call updates, file touches, and permission flows** |

`acplane` reads the ACP connection between the editor and the harness. It can
record only what the editor and harness emit over ACP. File lineage comes from
reported file touches rather than independent filesystem observation. Within
that boundary, the index combines sessions from configured ACP harnesses and
connects each file touch to its source session. If a harness sends ACP
permission requests, `acplane` evaluates them against the same policy.

## 90-second demo

1. In an ACP editor, run a small task through one configured harness, then run
   the same task through another. End each session by asking the agent to edit
   `.env`; the built-in `protect-secrets` rule denies the request when the
   harness sends it as an ACP permission request. Ordinary ACP traffic is still
   forwarded unchanged.
2. Build the index and start the dashboard:

   ```sh
   node bin/acplane.mjs index
   node bin/acplane.mjs ui
   ```

   Open `http://127.0.0.1:4319`.
3. In Sessions, confirm that both harnesses appear with their turn, tool, file,
   token, cost, and denial totals. Open Compare and put the two timelines side
   by side.
4. Open each session timeline and find the denied `.env` edit. Confirm that the
   permission entry names the `protect-secrets` rule.
5. Open File lineage and find the file used by the task. Its row lists the
   sessions and harnesses that read or wrote it.

## Manual capture checklist

Capturing the portfolio demo requires a manual run against real adapters.
Before recording:

- Run `npm run build`.
- Use a throwaway project with paths and content that are safe to show.
- Record two short sessions through the proxy with different real adapters.
  Include one edit request that the default policy denies.
- Run the index and dashboard commands above, then visit Sessions, both session
  timelines, File lineage, and Compare.
- Check the editor and dashboard for private paths or secrets before recording.
  The flight log is redacted at rest, but the editor display is not.
