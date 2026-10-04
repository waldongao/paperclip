import { tCli } from "../../i18n.js";
import type { Command } from "commander";
import {
  getStoredBoardCredential,
  loginBoardCli,
  removeStoredBoardCredential,
  revokeStoredBoardCredential,
} from "../../client/board-auth.js";
import {
  addCommonClientOptions,
  apiPath,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./common.js";

interface AuthLoginOptions extends BaseClientOptions {
  instanceAdmin?: boolean;
  browser?: boolean;
}

interface AuthLogoutOptions extends BaseClientOptions {}
interface AuthWhoamiOptions extends BaseClientOptions {}
interface AuthChallengeOptions extends BaseClientOptions {
  payloadJson?: string;
  token?: string;
  tokenEnv?: string;
}

export function registerClientAuthCommands(auth: Command): void {
  addCommonClientOptions(
    auth
      .command("login")
      .description(tCli("Authenticate the CLI for board-user access"))
      .option("--instance-admin", tCli("Request instance-admin approval instead of plain board access"), false)
      .option("--no-browser", tCli("Don't try to open a browser; just print the approval URL"))
      .action(async (opts: AuthLoginOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const login = await loginBoardCli({
            apiBase: ctx.api.apiBase,
            requestedAccess: opts.instanceAdmin ? "instance_admin_required" : "board",
            requestedCompanyId: ctx.companyId ?? null,
            command: "paperclipai auth login",
            openBrowser: opts.browser,
          });
          printOutput(
            {
              ok: true,
              apiBase: ctx.api.apiBase,
              userId: login.userId ?? null,
              approvalUrl: login.approvalUrl,
            },
            { json: ctx.json },
          );
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: true },
  );

  addCommonClientOptions(
    auth
      .command("logout")
      .description(tCli("Remove the stored board-user credential for this API base"))
      .action(async (opts: AuthLogoutOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const credential = getStoredBoardCredential(ctx.api.apiBase);
          if (!credential) {
            printOutput({ ok: true, apiBase: ctx.api.apiBase, revoked: false, removedLocalCredential: false }, { json: ctx.json });
            return;
          }
          let revoked = false;
          try {
            await revokeStoredBoardCredential({
              apiBase: ctx.api.apiBase,
              token: credential.token,
            });
            revoked = true;
          } catch {
            // Remove the local credential even if the server-side revoke fails.
          }
          const removedLocalCredential = removeStoredBoardCredential(ctx.api.apiBase);
          printOutput(
            {
              ok: true,
              apiBase: ctx.api.apiBase,
              revoked,
              removedLocalCredential,
            },
            { json: ctx.json },
          );
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    auth
      .command("revoke-current")
      .description(tCli("Revoke the current board API token"))
      .action(async (opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.post("/api/cli-auth/revoke-current", {}), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    auth
      .command("whoami")
      .description(tCli("Show the current board-user identity for this API base"))
      .action(async (opts: AuthWhoamiOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const me = await ctx.api.get<{
            user: { id: string; name: string; email: string } | null;
            userId: string;
            isInstanceAdmin: boolean;
            companyIds: string[];
            source: string;
            keyId: string | null;
          }>("/api/cli-auth/me");
          printOutput(me, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  const challenge = auth.command("challenge").description(tCli("CLI auth challenge operations"));
  addCommonClientOptions(
    challenge
      .command("create")
      .description(tCli("Create a CLI auth challenge"))
      .requiredOption("--payload-json <json>", tCli("CreateCliAuthChallenge JSON payload"))
      .action(async (opts: AuthChallengeOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.post("/api/cli-auth/challenges", parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
  addCommonClientOptions(
    challenge
      .command("get")
      .description(tCli("Get a CLI auth challenge"))
      .argument("<id>", tCli("Challenge ID"))
      .option("--token <token>", tCli("Challenge secret"))
      .option("--token-env <name>", tCli("Read the challenge secret from an environment variable"))
      .action(async (id: string, opts: AuthChallengeOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const query = new URLSearchParams({ token: resolveChallengeToken(opts) });
          printOutput(await ctx.api.get(`${apiPath`/api/cli-auth/challenges/${id}`}?${query.toString()}`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
  for (const action of ["approve", "cancel"] as const) {
    addCommonClientOptions(
      challenge
        .command(action)
        .description(tCli("{{action}} a CLI auth challenge", { action: tCli(action) }))
        .argument("<id>", tCli("Challenge ID"))
        .option("--token <token>", tCli("Challenge secret"))
        .option("--token-env <name>", tCli("Read the challenge secret from an environment variable"))
        .action(async (id: string, opts: AuthChallengeOptions) => {
          try {
            const ctx = resolveCommandContext(opts);
            printOutput(await ctx.api.post(`${apiPath`/api/cli-auth/challenges/${id}`}/${action}`, { token: resolveChallengeToken(opts) }), { json: ctx.json });
          } catch (err) {
            handleCommandError(err);
          }
        }),
    );
  }
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function resolveChallengeToken(opts: AuthChallengeOptions): string {
  const token = opts.token?.trim();
  if (token) return token;
  const envName = opts.tokenEnv?.trim();
  if (envName) {
    const envValue = process.env[envName]?.trim();
    if (envValue) return envValue;
    throw new Error(tCli("Environment variable {{envName}} is empty or not set.", { envName: envName }));
  }
  throw new Error(tCli("Challenge secret is required. Pass --token or --token-env."));
}
