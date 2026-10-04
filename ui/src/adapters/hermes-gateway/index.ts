import type { UIAdapterModule } from "../types";
import { parseStdoutLine as parseHermesGatewayStdoutLine } from "@paperclipai/hermes-paperclip-adapter/gateway/ui";
import { buildSchemaAdapterConfig } from "../schema-config-fields";
import { HermesGatewayConfigFields } from "./config-fields";
import { t } from "@/i18n";

export const hermesGatewayUIAdapter: UIAdapterModule = {
  type: "hermes_gateway",
  label: t("hermes_gateway"),
  parseStdoutLine: parseHermesGatewayStdoutLine,
  ConfigFields: HermesGatewayConfigFields,
  buildAdapterConfig: buildSchemaAdapterConfig,
};
