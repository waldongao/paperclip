import type { UIAdapterModule } from "../types";
import { parseCursorStdoutLine } from "@paperclipai/adapter-cursor-local/ui";
import { CursorLocalConfigFields } from "./config-fields";
import { buildCursorLocalConfig } from "@paperclipai/adapter-cursor-local/ui";
import { t } from "@/i18n";

export const cursorLocalUIAdapter: UIAdapterModule = {
  type: "cursor",
  label: t("cursor"),
  parseStdoutLine: parseCursorStdoutLine,
  ConfigFields: CursorLocalConfigFields,
  buildAdapterConfig: buildCursorLocalConfig,
};
