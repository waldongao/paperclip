import type { UIAdapterModule } from "../types";
import { parseHermesStdoutLine, buildHermesConfig } from "@paperclipai/hermes-paperclip-adapter/ui";
import { SchemaConfigFields } from "../schema-config-fields";
import { t } from "@/i18n";

export const hermesLocalUIAdapter: UIAdapterModule = {
  type: "hermes_local",
  label: t("hermes"),
  parseStdoutLine: parseHermesStdoutLine,
  ConfigFields: SchemaConfigFields,
  buildAdapterConfig: buildHermesConfig,
};
