import { createInterface } from "node:readline";

const send = (object) => process.stdout.write(`${JSON.stringify(object)}\n`);

// Asks permission to edit .env on every prompt, then acknowledges whatever
// permission response it receives so a test can observe the outcome.
createInterface({ input: process.stdin }).on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  if (message.id === "perm-1" && message.result) {
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "perm-session",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: `permission outcome: ${JSON.stringify(message.result.outcome)}` },
        },
      },
    });
    return;
  }

  switch (message.method) {
    case "initialize":
      send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: 1, agentCapabilities: {} } });
      break;
    case "session/new":
      send({ jsonrpc: "2.0", id: message.id, result: { sessionId: "perm-session" } });
      break;
    case "session/prompt":
      send({
        jsonrpc: "2.0",
        id: "perm-1",
        method: "session/request_permission",
        params: {
          sessionId: "perm-session",
          toolCall: { toolCallId: "tc-edit", kind: "edit", title: "Edit .env", locations: [{ path: ".env" }] },
          options: [
            { optionId: "allow", name: "Allow", kind: "allow_once" },
            { optionId: "reject", name: "Reject", kind: "reject_once" },
          ],
        },
      });
      send({ jsonrpc: "2.0", id: message.id, result: { stopReason: "end_turn" } });
      break;
    case "shutdown":
      send({ jsonrpc: "2.0", id: message.id, result: {} });
      process.exit(0);
  }
});
