import { tCli } from "../../i18n.js";
import { Command } from "commander";
import {
  addCommonClientOptions,
  apiPath,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./common.js";

interface CompanyOptions extends BaseClientOptions {
  companyId?: string;
}

interface JsonPayloadOptions extends CompanyOptions {
  payloadJson?: string;
}

interface QueryOptions extends CompanyOptions {
  query?: string;
  status?: string;
  requestType?: string;
  url?: string;
}

export function registerAccessCommands(program: Command): void {
  addWhoamiCommand(program);
  addCommonClientOptions(
    program
      .command("health")
      .description(tCli("Check API health"))
      .action(async (opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get("/api/health"), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  const access = program.command("access").description(tCli("Access and auth inspection operations"));
  addWhoamiCommand(access);

  addCommonClientOptions(
    program
      .command("openapi")
      .description(tCli("Print the OpenAPI document"))
      .action(async (opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get("/api/openapi.json"), { json: true });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  const profile = program.command("profile").description(tCli("Current user profile operations"));
  addSimpleGet(profile, "session", tCli("Get auth session"), "/api/auth/get-session");
  addSimpleGet(profile, "get", tCli("Get current auth profile"), "/api/auth/profile");
  addJsonPatch(profile, "update", tCli("Update current auth profile"), "/api/auth/profile");
  addCommonClientOptions(
    profile
      .command("company-user")
      .description(tCli("Get a user profile within a company"))
      .argument("<userSlug>", tCli("User slug"))
      .option("-C, --company-id <id>", tCli("Company ID"))
      .action(async (userSlug: string, opts: CompanyOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          printOutput(await ctx.api.get(apiPath`/api/companies/${ctx.companyId}/users/${userSlug}/profile`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  const invite = program.command("invite").description(tCli("Invite operations"));
  addCompanyList(invite, "list", tCli("List company invites"), "invites");
  addCompanyPost(invite, "create", tCli("Create an invite"), "invites");
  addCommonClientOptions(
    invite
      .command("revoke")
      .description(tCli("Revoke an invite"))
      .argument("<inviteId>", tCli("Invite ID"))
      .action(async (inviteId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.post(apiPath`/api/invites/${inviteId}/revoke`, {}), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
  for (const [name, suffix] of [
    ["show", ""],
    ["logo", "logo"],
    ["onboarding", "onboarding"],
    ["onboarding:text", "onboarding.txt"],
    ["skills:index", "skills/index"],
  ] as const) {
    addCommonClientOptions(
      invite
        .command(name)
        .description(tCli("Get invite {{name}}", { name: tCli(name) }))
        .argument("<token>", tCli("Invite token"))
        .action(async (token: string, opts: BaseClientOptions) => {
          try {
            const ctx = resolveCommandContext(opts);
            const path = `${apiPath`/api/invites/${token}`}${suffix ? `/${suffix}` : ""}`;
            printOutput(await ctx.api.get(path), { json: ctx.json });
          } catch (err) {
            handleCommandError(err);
          }
      }),
    );
  }
  addCommonClientOptions(
    invite
      .command("test-resolution")
      .description(tCli("Test invite URL resolution"))
      .argument("<token>", tCli("Invite token"))
      .requiredOption("--url <url>", tCli("URL to test"))
      .action(async (token: string, opts: QueryOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const query = new URLSearchParams({ url: opts.url ?? "" });
          printOutput(await ctx.api.get(`${apiPath`/api/invites/${token}/test-resolution`}?${query.toString()}`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
  addCommonClientOptions(
    invite
      .command("skill")
      .description(tCli("Get invite skill markdown"))
      .argument("<token>", tCli("Invite token"))
      .argument("<skillName>", tCli("Skill name"))
      .action(async (token: string, skillName: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get(apiPath`/api/invites/${token}/skills/${skillName}`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
  addCommonClientOptions(
    invite
      .command("accept")
      .description(tCli("Accept an invite"))
      .argument("<token>", tCli("Invite token"))
      .option("--payload-json <json>", tCli("Invite accept JSON payload"), "{}")
      .action(async (token: string, opts: JsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.post(apiPath`/api/invites/${token}/accept`, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  const join = program.command("join").description(tCli("Join request operations"));
  addCommonClientOptions(
    join
      .command("list")
      .description(tCli("List join requests"))
      .option("-C, --company-id <id>", tCli("Company ID"))
      .option("--status <status>", tCli("Filter by status (pending_approval, approved, rejected; pending alias accepted)"))
      .option("--request-type <type>", tCli("Filter by request type"))
      .action(async (opts: QueryOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const params = new URLSearchParams();
          const status = normalizeJoinStatus(opts.status);
          if (status) params.set("status", status);
          if (opts.requestType) params.set("requestType", opts.requestType);
          const query = params.toString();
          printOutput(await ctx.api.get(`${apiPath`/api/companies/${ctx.companyId}/join-requests`}${query ? `?${query}` : ""}`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
  addJoinAction(join, "approve");
  addJoinAction(join, "reject");
  addCommonClientOptions(
    join
      .command("claim-key")
      .description(tCli("Claim an agent API key for an approved join request"))
      .argument("<requestId>", tCli("Join request ID"))
      .requiredOption("--claim-secret <secret>", tCli("Claim secret"))
      .action(async (requestId: string, opts: BaseClientOptions & { claimSecret: string }) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.post(apiPath`/api/join-requests/${requestId}/claim-api-key`, { claimSecret: opts.claimSecret }), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  const member = program.command("member").description(tCli("Company member operations"));
  addCompanyList(member, "list", tCli("List company members"), "members");
  addCompanyList(member, "user-directory", tCli("List company user directory"), "user-directory");
  addMemberPatch(member, "update", "members");
  addMemberPatch(member, "role-and-grants", "members", "role-and-grants");
  addMemberPatch(member, "permissions", "members", "permissions");
  addMemberPost(member, "archive", "members", "archive");

  const admin = program.command("admin").description(tCli("Instance admin operations"));
  const user = admin.command("user").description(tCli("Admin user operations"));
  addCommonClientOptions(
    user
      .command("list")
      .description(tCli("List users"))
      .option("--query <text>", tCli("Search query"))
      .action(async (opts: QueryOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const query = opts.query ? `?${new URLSearchParams({ query: opts.query }).toString()}` : "";
          printOutput(await ctx.api.get(`/api/admin/users${query}`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
  addAdminUserPost(user, "promote", "promote-instance-admin");
  addAdminUserPost(user, "demote", "demote-instance-admin");
  addCommonClientOptions(
    user
      .command("company-access")
      .description(tCli("Get user company access"))
      .argument("<userId>", tCli("User ID"))
      .action(async (userId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get(apiPath`/api/admin/users/${userId}/company-access`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
  addCommonClientOptions(
    user
      .command("company-access:update")
      .description(tCli("Update user company access"))
      .argument("<userId>", tCli("User ID"))
      .requiredOption("--payload-json <json>", tCli("UpdateUserCompanyAccess JSON payload"))
      .action(async (userId: string, opts: JsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.put(apiPath`/api/admin/users/${userId}/company-access`, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  const instance = program.command("instance").description(tCli("Instance operations"));
  addSimpleGet(instance, "scheduler-heartbeats", tCli("List scheduler heartbeat agents"), "/api/instance/scheduler-heartbeats");
  addSimpleGet(instance, "settings:general", tCli("Get general instance settings"), "/api/instance/settings/general");
  addJsonPatch(instance, "settings:general:update", tCli("Update general instance settings"), "/api/instance/settings/general");
  addSimpleGet(instance, "settings:experimental", tCli("Get experimental instance settings"), "/api/instance/settings/experimental");
  addJsonPatch(instance, "settings:experimental:update", tCli("Update experimental instance settings"), "/api/instance/settings/experimental");
  addCommonClientOptions(
    instance
      .command("database-backup")
      .description(tCli("Create a database backup"))
      .action(async (opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.post("/api/instance/database-backups", {}), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  const sidebar = program.command("sidebar").description(tCli("Sidebar preference and badge operations"));
  addSimpleGet(sidebar, "preferences", tCli("Get current sidebar preferences"), "/api/sidebar-preferences/me");
  addJsonPut(sidebar, "preferences:update", tCli("Update current sidebar preferences"), "/api/sidebar-preferences/me");
  addCompanyList(sidebar, "project-preferences", tCli("Get current project sidebar preferences"), "sidebar-preferences/me");
  addCompanyPut(sidebar, "project-preferences:update", tCli("Update current project sidebar preferences"), "sidebar-preferences/me");
  addCompanyList(sidebar, "badges", tCli("Get sidebar badges"), "sidebar-badges");

  const inbox = program.command("inbox").description(tCli("Board inbox operations"));
  addCompanyList(inbox, "dismissals", tCli("List dismissed inbox items"), "inbox-dismissals");
  addCompanyPost(inbox, "dismiss", tCli("Dismiss an inbox item"), "inbox-dismissals");

  const boardClaim = program.command("board-claim").description(tCli("Board claim token operations"));
  addCommonClientOptions(
    boardClaim
      .command("show")
      .description(tCli("Inspect a board claim token"))
      .argument("<token>", tCli("Claim token"))
      .action(async (token: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get(apiPath`/api/board-claim/${token}`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
  addCommonClientOptions(
    boardClaim
      .command("claim")
      .description(tCli("Claim a board claim token"))
      .argument("<token>", tCli("Claim token"))
      .option("--payload-json <json>", tCli("Claim JSON payload"), "{}")
      .action(async (token: string, opts: JsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.post(apiPath`/api/board-claim/${token}/claim`, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  const openclaw = program.command("openclaw").description(tCli("OpenClaw integration helpers"));
  addCompanyPost(openclaw, "invite-prompt", tCli("Create an OpenClaw invite prompt"), "openclaw/invite-prompt");

  const publicSkills = program.command("available-skill").description(tCli("Public skill catalog operations"));
  addSimpleGet(publicSkills, "list", tCli("List available skills"), "/api/skills/available");
  addSimpleGet(publicSkills, "index", tCli("Get available skill index"), "/api/skills/index");
  addCommonClientOptions(
    publicSkills
      .command("get")
      .description(tCli("Get available skill markdown"))
      .argument("<skillName>", tCli("Skill name"))
      .action(async (skillName: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get(apiPath`/api/skills/${skillName}`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  const llm = program.command("llm").description(tCli("LLM prompt documentation"));
  addSimpleGet(llm, "agent-configuration", tCli("Get agent configuration prompt docs"), "/api/llms/agent-configuration.txt");
  addSimpleGet(llm, "agent-icons", tCli("Get agent icon prompt docs"), "/api/llms/agent-icons.txt");
  addCommonClientOptions(
    llm
      .command("agent-configuration:adapter")
      .description(tCli("Get adapter-specific agent configuration prompt docs"))
      .argument("<adapterType>", tCli("Adapter type"))
      .action(async (adapterType: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get(`${apiPath`/api/llms/agent-configuration/${adapterType}`}.txt`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}

function addWhoamiCommand(parent: Command): void {
  addCommonClientOptions(
    parent
      .command("whoami")
      .description(tCli("Show current CLI auth identity"))
      .action(async (opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get("/api/cli-auth/me"), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}

function normalizeJoinStatus(status: string | undefined): string | undefined {
  if (status === "pending") return "pending_approval";
  return status;
}

function addSimpleGet(parent: Command, name: string, description: string, path: string): void {
  addCommonClientOptions(parent.command(name).description(description).action(async (opts: BaseClientOptions) => {
    try {
      const ctx = resolveCommandContext(opts);
      printOutput(await ctx.api.get(path), { json: ctx.json });
    } catch (err) {
      handleCommandError(err);
    }
  }));
}

function addJsonPatch(parent: Command, name: string, description: string, path: string): void {
  addCommonClientOptions(parent.command(name).description(description).requiredOption("--payload-json <json>", tCli("JSON payload")).action(async (opts: JsonPayloadOptions) => {
    try {
      const ctx = resolveCommandContext(opts);
      printOutput(await ctx.api.patch(path, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
    } catch (err) {
      handleCommandError(err);
    }
  }));
}

function addJsonPut(parent: Command, name: string, description: string, path: string): void {
  addCommonClientOptions(parent.command(name).description(description).requiredOption("--payload-json <json>", tCli("JSON payload")).action(async (opts: JsonPayloadOptions) => {
    try {
      const ctx = resolveCommandContext(opts);
      printOutput(await ctx.api.put(path, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
    } catch (err) {
      handleCommandError(err);
    }
  }));
}

function addCompanyList(parent: Command, name: string, description: string, path: string): void {
  addCommonClientOptions(
    parent.command(name).description(description).option("-C, --company-id <id>", tCli("Company ID")).action(async (opts: CompanyOptions) => {
      try {
        const ctx = resolveCommandContext(opts, { requireCompany: true });
        printOutput(await ctx.api.get(`${apiPath`/api/companies/${ctx.companyId}`}/${path}`), { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    }),
    { includeCompany: false },
  );
}

function addCompanyPut(parent: Command, name: string, description: string, path: string): void {
  addCommonClientOptions(
    parent.command(name).description(description).option("-C, --company-id <id>", tCli("Company ID")).requiredOption("--payload-json <json>", tCli("JSON payload")).action(async (opts: JsonPayloadOptions) => {
      try {
        const ctx = resolveCommandContext(opts, { requireCompany: true });
        printOutput(await ctx.api.put(`${apiPath`/api/companies/${ctx.companyId}`}/${path}`, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    }),
    { includeCompany: false },
  );
}

function addCompanyPost(parent: Command, name: string, description: string, path: string): void {
  addCommonClientOptions(
    parent.command(name).description(description).option("-C, --company-id <id>", tCli("Company ID")).requiredOption("--payload-json <json>", tCli("JSON payload")).action(async (opts: JsonPayloadOptions) => {
      try {
        const ctx = resolveCommandContext(opts, { requireCompany: true });
        printOutput(await ctx.api.post(`${apiPath`/api/companies/${ctx.companyId}`}/${path}`, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    }),
    { includeCompany: false },
  );
}

function addJoinAction(parent: Command, action: "approve" | "reject"): void {
  addCommonClientOptions(
    parent.command(action).description(tCli("{{action}} a join request", { action: tCli(action) })).argument("<requestId>", tCli("Join request ID")).option("-C, --company-id <id>", tCli("Company ID")).action(async (requestId: string, opts: CompanyOptions) => {
      try {
        const ctx = resolveCommandContext(opts, { requireCompany: true });
        printOutput(await ctx.api.post(`${apiPath`/api/companies/${ctx.companyId}/join-requests/${requestId}`}/${action}`, {}), { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    }),
    { includeCompany: false },
  );
}

function addMemberPatch(parent: Command, name: string, path: string, suffix?: string): void {
  addCommonClientOptions(
    parent.command(name).description(tCli("{{name}} a member", { name: tCli(name) })).argument("<memberId>", tCli("Member ID")).option("-C, --company-id <id>", tCli("Company ID")).requiredOption("--payload-json <json>", tCli("JSON payload")).action(async (memberId: string, opts: JsonPayloadOptions) => {
      try {
        const ctx = resolveCommandContext(opts, { requireCompany: true });
        const route = `${apiPath`/api/companies/${ctx.companyId}`}/${path}/${encodeURIComponent(memberId)}${suffix ? `/${suffix}` : ""}`;
        printOutput(await ctx.api.patch(route, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    }),
    { includeCompany: false },
  );
}

function addMemberPost(parent: Command, name: string, path: string, suffix: string): void {
  addCommonClientOptions(
    parent.command(name).description(tCli("{{name}} a member", { name: tCli(name) })).argument("<memberId>", tCli("Member ID")).option("-C, --company-id <id>", tCli("Company ID")).option("--payload-json <json>", tCli("JSON payload"), "{}").action(async (memberId: string, opts: JsonPayloadOptions) => {
      try {
        const ctx = resolveCommandContext(opts, { requireCompany: true });
        printOutput(await ctx.api.post(`${apiPath`/api/companies/${ctx.companyId}`}/${path}/${encodeURIComponent(memberId)}/${suffix}`, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    }),
    { includeCompany: false },
  );
}

function addAdminUserPost(parent: Command, name: string, suffix: string): void {
  addCommonClientOptions(parent.command(name).description(tCli("{{name}} instance admin", { name: tCli(name) })).argument("<userId>", tCli("User ID")).action(async (userId: string, opts: BaseClientOptions) => {
    try {
      const ctx = resolveCommandContext(opts);
      printOutput(await ctx.api.post(`${apiPath`/api/admin/users/${userId}`}/${suffix}`, {}), { json: ctx.json });
    } catch (err) {
      handleCommandError(err);
    }
  }));
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}
