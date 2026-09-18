import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI): void {
  pi.registerCommand("reload-keep", {
    description: "Reload keybindings, extensions, skills, prompts, themes, and context files without clearing the editor",
    handler: async (_args, ctx) => {
      await ctx.reload();
    },
  });

  pi.registerShortcut("alt+r", {
    description: "Reload keeping the editor draft",
    handler: (ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("Wait for the current response to finish before reloading.", "warning");
        return;
      }
      const options: { deliverAs?: "steer" | "followUp"; expandPromptTemplates?: boolean } = { expandPromptTemplates: true };
      pi.sendUserMessage("/reload-keep", options);
    },
  });
}
