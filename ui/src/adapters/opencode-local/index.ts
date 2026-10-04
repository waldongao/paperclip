import type { UIAdapterModule } from "../types";
import { parseOpenCodeStdoutLine } from "@paperclipai/adapter-opencode-local/ui";
import { OpenCodeLocalConfigFields } from "./config-fields";
import { buildOpenCodeLocalConfig } from "@paperclipai/adapter-opencode-local/ui";
import { t } from "@/i18n";

export const openCodeLocalUIAdapter: UIAdapterModule = {
  type: "opencode_local",
  label: t("opencode"),
  parseStdoutLine: parseOpenCodeStdoutLine,
  ConfigFields: OpenCodeLocalConfigFields,
  buildAdapterConfig: buildOpenCodeLocalConfig,
};
