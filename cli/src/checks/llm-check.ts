import { tCli } from "../i18n.js";
import type { PaperclipConfig } from "../config/schema.js";
import type { CheckResult } from "./index.js";

export async function llmCheck(config: PaperclipConfig): Promise<CheckResult> {
  if (!config.llm) {
    return {
      name: tCli("LLM provider"),
      status: "pass",
      message: tCli("No LLM provider configured (optional)"),
    };
  }

  if (!config.llm.apiKey) {
    return {
      name: tCli("LLM provider"),
      status: "pass",
      message: tCli("{{provider}} configured but no API key set (optional)", { provider: String(config.llm.provider) }),
    };
  }

  try {
    if (config.llm.provider === "claude") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": config.llm.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      if (res.ok || res.status === 400) {
        return { name: tCli("LLM provider"), status: "pass", message: tCli("Claude API key is valid") };
      }
      if (res.status === 401) {
        return {
          name: tCli("LLM provider"),
          status: "fail",
          message: tCli("Claude API key is invalid (401)"),
          canRepair: false,
          repairHint: tCli("Run `paperclipai configure --section llm`"),
        };
      }
      return {
        name: tCli("LLM provider"),
        status: "warn",
        message: tCli("Claude API returned status {{status}}", { status: String(res.status) }),
      };
    } else {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${config.llm.apiKey}` },
      });
      if (res.ok) {
        return { name: tCli("LLM provider"), status: "pass", message: tCli("OpenAI API key is valid") };
      }
      if (res.status === 401) {
        return {
          name: tCli("LLM provider"),
          status: "fail",
          message: tCli("OpenAI API key is invalid (401)"),
          canRepair: false,
          repairHint: tCli("Run `paperclipai configure --section llm`"),
        };
      }
      return {
        name: tCli("LLM provider"),
        status: "warn",
        message: tCli("OpenAI API returned status {{status}}", { status: String(res.status) }),
      };
    }
  } catch {
    return {
      name: tCli("LLM provider"),
      status: "warn",
      message: tCli("Could not reach API to validate key"),
    };
  }
}
