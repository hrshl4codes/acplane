import { createInterface } from "node:readline";

const respond = (id, result) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
const notify = (method, params) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);

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
      respond(message.id, { sessionId: "fake-session-1" });
      break;
    case "session/prompt":
      notify("session/update", {
        sessionId: "fake-session-1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "working" },
        },
      });
      notify("session/update", {
        sessionId: "fake-session-1",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "tc-1",
          kind: "read",
          title: "Read file",
          locations: [{ path: "src/index.ts" }],
        },
      });
      respond(message.id, { stopReason: "end_turn" });
      break;
    case "shutdown":
      respond(message.id, {});
      process.exit(0);
  }
});
