import type { UIAdapterModule } from "../types";
import { SchemaConfigFields } from "../schema-config-fields";
import {
  buildCursorCloudConfig,
  parseCursorCloudStdoutLine,
} from "@paperclipai/adapter-cursor-cloud/ui";
import { t } from "@/i18n";

export const cursorCloudUIAdapter: UIAdapterModule = {
  type: "cursor_cloud",
  label: t("cursor_cloud"),
  parseStdoutLine: parseCursorCloudStdoutLine,
  ConfigFields: SchemaConfigFields,
  buildAdapterConfig: buildCursorCloudConfig,
};
