import { tCli } from "../../i18n.js";
import { Command } from "commander";
import {
  CONNECTION_INTENT_AGENT_GUIDANCE,
  connectionRequestInputSchema,
  connectionsSearchInputSchema,
} from "@paperclipai/shared";

interface RuntimeConnectionOptions {
  retryProviderChoice?: boolean;
  json?: boolean;
}

async function callRuntimeConnectionTool(
  endpointEnv: "PAPERCLIP_RUNTIME_TOOLS_CONNECTIONS_SEARCH_URL" | "PAPERCLIP_RUNTIME_TOOLS_CONNECTION_REQUEST_URL",
  body: unknown,
) {
  const endpoint = process.env[endpointEnv]?.trim();
  const token = process.env.PAPERCLIP_RUNTIME_TOOLS_TOKEN?.trim();
  if (!endpoint || !token) {
    throw new Error(tCli("This command requires the runtime connection environment from an active heartbeat run"));
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) as unknown : null;
  if (!response.ok) {
    const message = parsed && typeof parsed === "object" && "error" in parsed
      ? String((parsed as { error: unknown }).error)
      : tCli("Runtime connection request failed with {{status}}", { status: response.status });
    throw new Error(message);
  }
  return parsed;
}

function writeResult(value: unknown, options: RuntimeConnectionOptions) {
  process.stdout.write(`${JSON.stringify(value, null, options.json ? 2 : 0)}\n`);
}

export function registerConnectionIntentCommands(program: Command) {
  const connections = program
    .command("connections")
    .description(tCli("Search or request connections from an active heartbeat run"))
    .addHelpText("after", `\n${CONNECTION_INTENT_AGENT_GUIDANCE}\n`);

  connections
    .command("search")
    .argument("[query]", tCli("Service name or capability"))
    .option("--retry-provider-choice", tCli("Reconsider a provider choice only at the user’s explicit request"))
    .option("--json", tCli("Print formatted JSON"))
    .action(async (query: string | undefined, options: RuntimeConnectionOptions) => {
      const input = connectionsSearchInputSchema.parse({ query: query ?? "", retryProviderChoice: options.retryProviderChoice });
      writeResult(await callRuntimeConnectionTool(
        "PAPERCLIP_RUNTIME_TOOLS_CONNECTIONS_SEARCH_URL",
        input,
      ), options);
    });

  connections
    .command("request")
    .argument("<service>", tCli("Connectable service slug"))
    .option("--target-service <slug>", tCli("Requested app when the user explicitly names an external provider"))
    .option("--selection-interaction-id <id>", tCli("Answered external-provider question ID"))
    .option("--json", tCli("Print formatted JSON"))
    .action(async (service: string, options: RuntimeConnectionOptions & { targetService?: string }) => {
      const input = connectionRequestInputSchema.parse({ service, targetService: options.targetService, selectionInteractionId: (options as RuntimeConnectionOptions & { selectionInteractionId?: string }).selectionInteractionId });
      writeResult(await callRuntimeConnectionTool(
        "PAPERCLIP_RUNTIME_TOOLS_CONNECTION_REQUEST_URL",
        input,
      ), options);
    });
}
