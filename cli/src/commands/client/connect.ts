import { tCli } from "../../i18n.js";
import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import type { Agent, Company } from "@paperclipai/shared";
import { createAgentKeySchema, createBoardApiKeySchema } from "@paperclipai/shared";
import { loginBoardCli } from "../../client/board-auth.js";
import { PaperclipApiClient } from "../../client/http.js";
import { resolveProfile, readContext, setCurrentProfile, upsertProfile } from "../../client/context.js";
import {
  addCommonClientOptions,
  apiPath,
  handleCommandError,
  normalizeApiBase,
  printOutput,
  resolveApiBase,
  type BaseClientOptions,
} from "./common.js";

interface ConnectOptions extends BaseClientOptions {
  profile?: string;
  persona?: "board" | "agent";
  apiKeyEnvVarName?: string;
  tokenName?: string;
}

interface CreatedAgentKey {
  id: string;
  name: string;
  token: string;
  createdAt: string;
}

interface CreatedBoardKey extends CreatedAgentKey {
  expiresAt: string | null;
}

export function registerConnectCommand(program: Command): void {
  addCommonClientOptions(
    program
      .command("connect")
      .description(tCli("Interactively connect the CLI as a board operator or agent"))
      .option("--persona <persona>", tCli("Persona to configure: board or agent"))
      .option("--api-key-env-var-name <name>", tCli("Env var name to store in the profile"), "PAPERCLIP_API_KEY")
      .option("--token-name <name>", tCli("Token label to create"))
      .action(async (opts: ConnectOptions) => {
        try {
          const result = await connectWizard(opts);
          printOutput(result, { json: opts.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}

async function connectWizard(opts: ConnectOptions) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(tCli("`paperclipai connect` is interactive. For scripts, pass --api-base/--api-key or use context set/token commands."));
  }

  p.intro(pc.bgCyan(pc.black(" paperclipai connect ")));

  const context = readContext(opts.context);
  const resolvedProfile = resolveProfile(context, opts.profile);
  const initialApiBase = resolveApiBase(opts, resolvedProfile.profile);
  const apiBaseInput = await p.text({
    message: tCli("Paperclip API base"),
    initialValue: initialApiBase,
    placeholder: "http://localhost:3100",
  });
  assertNotCancelled(apiBaseInput);
  const apiBase = normalizeApiBase(String(apiBaseInput || initialApiBase));
  console.log(pc.dim(tCli("Checking {{apiBase}}/api/health ...", { apiBase: apiBase })));
  await verifyHealth(apiBase);

  const boardLogin = await loginBoardCli({
    apiBase,
    requestedAccess: "board",
    requestedCompanyId: opts.companyId ?? resolvedProfile.profile.companyId ?? null,
    command: "paperclipai connect",
  });
  const boardApi = new PaperclipApiClient({ apiBase, apiKey: boardLogin.token });
  const companies = (await boardApi.get<Company[]>("/api/companies")) ?? [];

  const persona = await choosePersona(opts.persona);
  const profileName = opts.profile?.trim() || await askProfileName(resolvedProfile.name);
  const apiKeyEnvVarName = opts.apiKeyEnvVarName?.trim() || "PAPERCLIP_API_KEY";

  if (persona === "board") {
    const company = await chooseCompany(companies, opts.companyId ?? resolvedProfile.profile.companyId, {
      optional: true,
    });
    const tokenName = opts.tokenName?.trim() || `cli-board-${new Date().toISOString()}`;
    const key = await boardApi.post<CreatedBoardKey>("/api/board-api-keys", createBoardApiKeySchema.parse({
      name: tokenName,
      requestedCompanyId: company?.id ?? null,
    }));
    if (!key) throw new Error(tCli("Failed to create board token"));
    upsertProfile(profileName, {
      apiBase,
      companyId: company?.id,
      persona: "board",
      agentId: "",
      agentName: "",
      apiKeyEnvVarName,
      tokenName: key.name,
      tokenId: key.id,
      tokenCreatedAt: key.createdAt,
    }, opts.context);
    setCurrentProfile(profileName, opts.context);
    p.outro(pc.green(tCli("Connected profile '{{profileName}}' as board.", { profileName: profileName })));
    return {
      ok: true,
      profile: profileName,
      persona: "board",
      apiBase,
      companyId: company?.id ?? null,
      key: publicKeyResult(key),
      exports: buildExports({ apiBase, companyId: company?.id, agentId: undefined, envName: apiKeyEnvVarName, token: key.token }),
    };
  }

  const company = await chooseCompany(companies, opts.companyId ?? resolvedProfile.profile.companyId, {
    optional: false,
  });
  if (!company) throw new Error(tCli("Company is required for agent profiles"));
  const agents = (await boardApi.get<Agent[]>(apiPath`/api/companies/${company.id}/agents`)) ?? [];
  if (agents.length === 0) throw new Error(tCli("Company '{{name}}' has no agents to connect.", { name: company.name }));
  const agent = await chooseAgent(agents, resolvedProfile.profile.agentId);
  const tokenName = opts.tokenName?.trim() || `cli-agent-${new Date().toISOString()}`;
  const key = await boardApi.post<CreatedAgentKey>(apiPath`/api/agents/${agent.id}/keys`, createAgentKeySchema.parse({ name: tokenName }));
  if (!key) throw new Error(tCli("Failed to create agent token"));
  upsertProfile(profileName, {
    apiBase,
    companyId: company.id,
    persona: "agent",
    agentId: agent.id,
    agentName: agent.name,
    apiKeyEnvVarName,
    tokenName: key.name,
    tokenId: key.id,
    tokenCreatedAt: key.createdAt,
  }, opts.context);
  setCurrentProfile(profileName, opts.context);
  p.outro(pc.green(tCli("Connected profile '{{profileName}}' as {{name}}.", { profileName: profileName, name: agent.name })));
  return {
    ok: true,
    profile: profileName,
    persona: "agent",
    apiBase,
    companyId: company.id,
    agentId: agent.id,
    agentName: agent.name,
    key: publicKeyResult(key),
    exports: buildExports({ apiBase, companyId: company.id, agentId: agent.id, envName: apiKeyEnvVarName, token: key.token }),
  };
}

async function verifyHealth(apiBase: string): Promise<void> {
  const api = new PaperclipApiClient({ apiBase });
  await api.get("/api/health");
}

async function choosePersona(input: string | undefined): Promise<"board" | "agent"> {
  if (input === "board" || input === "agent") return input;
  const selected = await p.select({
    message: tCli("Connect as"),
    options: [
      { value: "board", label: tCli("Board operator") },
      { value: "agent", label: tCli("Agent in a company") },
    ],
  });
  assertNotCancelled(selected);
  return selected as "board" | "agent";
}

async function askProfileName(defaultName: string): Promise<string> {
  const profile = await p.text({
    message: tCli("Profile name"),
    initialValue: defaultName || "default",
  });
  assertNotCancelled(profile);
  const value = String(profile).trim();
  if (!value) throw new Error(tCli("Profile name is required"));
  return value;
}

async function chooseCompany(
  companies: Company[],
  preferredCompanyId: string | undefined,
  opts: { optional: boolean },
): Promise<Company | null> {
  if (companies.length === 0) {
    if (opts.optional) return null;
    throw new Error(tCli("No companies are accessible with this board credential."));
  }
  const preferred = preferredCompanyId ? companies.find((company) => company.id === preferredCompanyId) : null;
  if (companies.length === 1 && !opts.optional) return companies[0] ?? null;
  const selected = await p.select({
    message: opts.optional ? tCli("Default company for this profile") : tCli("Agent company"),
    initialValue: preferred?.id ?? companies[0]?.id,
    options: [
      ...(opts.optional ? [{ value: "", label: tCli("(none)") }] : []),
      ...companies.map((company) => ({
        value: company.id,
        label: company.name,
        hint: company.id,
      })),
    ],
  });
  assertNotCancelled(selected);
  if (!selected) return null;
  return companies.find((company) => company.id === selected) ?? null;
}

async function chooseAgent(agents: Agent[], preferredAgentId: string | undefined): Promise<Agent> {
  const selected = await p.select({
    message: tCli("Agent"),
    initialValue: preferredAgentId && agents.some((agent) => agent.id === preferredAgentId)
      ? preferredAgentId
      : agents[0]?.id,
    options: agents.map((agent) => ({
      value: agent.id,
      label: agent.name,
      hint: agent.role,
    })),
  });
  assertNotCancelled(selected);
  const agent = agents.find((item) => item.id === selected);
  if (!agent) throw new Error(tCli("Agent selection failed"));
  return agent;
}

function buildExports(input: {
  apiBase: string;
  companyId?: string;
  agentId?: string;
  envName: string;
  token: string;
}): string {
  const escaped = (value: string) => value.replace(/'/g, "'\"'\"'");
  return [
    `export PAPERCLIP_API_URL='${escaped(input.apiBase)}'`,
    input.companyId ? `export PAPERCLIP_COMPANY_ID='${escaped(input.companyId)}'` : null,
    input.agentId ? `export PAPERCLIP_AGENT_ID='${escaped(input.agentId)}'` : null,
    `export ${input.envName}='${escaped(input.token)}'`,
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function publicKeyResult(key: CreatedAgentKey | CreatedBoardKey) {
  return {
    id: key.id,
    name: key.name,
    createdAt: key.createdAt,
    token: key.token,
    expiresAt: "expiresAt" in key ? key.expiresAt : undefined,
  };
}

function assertNotCancelled<T>(value: T | symbol): asserts value is T {
  if (p.isCancel(value)) {
    p.cancel(tCli("Cancelled."));
    process.exit(0);
  }
}
