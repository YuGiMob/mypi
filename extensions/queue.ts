/**
 * Queue Command - /q <message>
 *
 * Queues a user message to be sent when the agent finishes its current task.
 * Unlike sending a message directly (which may interrupt the agent mid-stream),
 * this waits until the agent is idle before delivering the message.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("q", {
    description: "Queue a message to be sent when the agent finishes its current task",
    handler: async (args, ctx) => {
      if (!args || !args.trim()) {
        ctx.ui.notify("Usage: /q <message> - queues a message for when the agent is idle", "warning");
        return;
      }

      const message = args.trim();
      ctx.ui.notify("Queued. Will send when agent is idle.", "info");

      pi.sendUserMessage(message, { deliverAs: "followUp" });
    },
  });
}
