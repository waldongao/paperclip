import type { UIAdapterModule } from "../types";
import { parseProcessStdoutLine } from "./parse-stdout";
import { ProcessConfigFields } from "./config-fields";
import { buildProcessConfig } from "./build-config";
import { t } from "@/i18n";

export const processUIAdapter: UIAdapterModule = {
  type: "process",
  label: t("shell_process"),
  parseStdoutLine: parseProcessStdoutLine,
  ConfigFields: ProcessConfigFields,
  buildAdapterConfig: buildProcessConfig,
};
