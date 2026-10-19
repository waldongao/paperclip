import { tCli } from "../i18n.js";
import * as p from "@clack/prompts";
import type { LlmConfig } from "../config/schema.js";

export async function promptLlm(): Promise<LlmConfig | undefined> {
  const configureLlm = await p.confirm({
    message: tCli("Configure an LLM provider now?"),
    initialValue: false,
  });

  if (p.isCancel(configureLlm)) {
    p.cancel(tCli("Setup cancelled."));
    process.exit(0);
  }

  if (!configureLlm) return undefined;

  const provider = await p.select({
    message: tCli("LLM provider"),
    options: [
      { value: "claude" as const, label: "Claude (Anthropic)" },
      { value: "openai" as const, label: "OpenAI" },
    ],
  });

  if (p.isCancel(provider)) {
    p.cancel(tCli("Setup cancelled."));
    process.exit(0);
  }

  const apiKey = await p.password({
    message: tCli("{{providerName}} API key", { providerName: String(provider === "claude" ? "Anthropic" : "OpenAI") }),
    validate: (val) => {
      if (!val) return tCli("API key is required");
    },
  });

  if (p.isCancel(apiKey)) {
    p.cancel(tCli("Setup cancelled."));
    process.exit(0);
  }

  return { provider, apiKey };
}
