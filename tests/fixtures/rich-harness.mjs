import { createInterface } from "node:readline";

const respond = (id, result) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
const notify = (method, params) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);

// A deterministic ACP-shaped agent that exercises a richer message flow than
// fake-harness: an assistant message, a read tool call, an edit tool call with
// a diff, and a prompt response carrying harness-reported token usage. It is a
// test double, not a real agent.
createInterface({ input: process.stdin }).on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  switch (message.method) {
    case "initialize":
      respond(message.id, { protocolVersion: 1, agentCapabilities: {} });
      break;
    case "session/new":
      respond(message.id, { sessionId: "rich-session" });
      break;
    case "session/prompt":
      notify("session/update", {
        sessionId: "rich-session",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Reading, then editing." },
        },
      });
      notify("session/update", {
        sessionId: "rich-session",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "tc-read",
          kind: "read",
          status: "completed",
          title: "Read src/app.ts",
          locations: [{ path: "src/app.ts" }],
          rawInput: { path: "src/app.ts" },
        },
      });
      notify("session/update", {
        sessionId: "rich-session",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "tc-edit",
          kind: "edit",
          status: "completed",
          title: "Edit src/app.ts",
          locations: [{ path: "src/app.ts" }],
          content: [
            {
              type: "diff",
              path: "src/app.ts",
              oldText: "const a = 1;",
              newText: "const a = 2;",
            },
          ],
        },
      });
      respond(message.id, {
        stopReason: "end_turn",
        _meta: { usage: { inputTokens: 1500, outputTokens: 420 } },
      });
      break;
    case "shutdown":
      respond(message.id, {});
      process.exit(0);
  }
});
