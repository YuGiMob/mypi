import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("q", {
    description: "Send a follow-up message to the agent",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/q requires interactive mode", "error");
        return;
      }
      if (!args || !args.trim()) {
        ctx.ui.notify("Usage: /q <message> - sends a follow-up message to the agent", "warning");
        return;
      }
      const message = args.trim();
      ctx.ui.notify("Follow-up message sent.", "info");
      pi.sendUserMessage(message, { deliverAs: "followUp" });
    },
  });
}
