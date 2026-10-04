import type { UIAdapterModule } from "../types";
import { parseGeminiStdoutLine } from "@paperclipai/adapter-gemini-local/ui";
import { GeminiLocalConfigFields } from "./config-fields";
import { buildGeminiLocalConfig } from "@paperclipai/adapter-gemini-local/ui";
import { t } from "@/i18n";

export const geminiLocalUIAdapter: UIAdapterModule = {
  type: "gemini_local",
  label: t("gemini_cli"),
  parseStdoutLine: parseGeminiStdoutLine,
  ConfigFields: GeminiLocalConfigFields,
  buildAdapterConfig: buildGeminiLocalConfig,
};
