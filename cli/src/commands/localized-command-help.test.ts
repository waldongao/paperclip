import { afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { configureLocalizedHelp } from "./cli-help.js";
import { registerEmailCommands } from "./client/email.js";
import { registerMcpCommands } from "./mcp.js";
import { registerTestDriveCommand } from "./test-drive.js";

afterEach(() => vi.unstubAllEnvs());

function commands() {
  const program = new Command().name("paperclipai");
  configureLocalizedHelp(program);
  registerEmailCommands(program);
  registerMcpCommands(program);
  registerTestDriveCommand(program);
  return program;
}

describe("stable release command localization", () => {
  it("localizes new commands while preserving flags, model choices and default names", () => {
    vi.stubEnv("PAPERCLIP_LOCALE", "zh-CN");
    const program = commands();
    const testDrive = program.commands.find((command) => command.name() === "test-drive")!;
    const help = testDrive.helpInformation();
    expect(help).toContain("启动已初始化的隔离 Paperclip 实例");
    expect(help).toContain("--company-name <name>");
    expect(help).toContain('"Test Company"');
    expect(help).toContain('"CEO"');
    expect(help).toContain('"claude", "codex", "opencode"');
    expect(help).toContain("从环境变量读取提供商密钥");
    const mcp = program.commands.find((command) => command.name() === "mcp")!;
    expect(mcp.helpInformation()).toContain("以人类用户身份授权助手连接 Paperclip");
    expect(mcp.commands.find((command) => command.name() === "login")!.helpInformation())
      .toContain("--url <url>");
    const email = program.commands.find((command) => command.name() === "email")!;
    expect(email.helpInformation()).toContain("关联任务的 AgentMail 会话");
    expect(email.commands.find((command) => command.name() === "send")!.helpInformation())
      .toContain("JSON 请求文件，须包含固定的 idempotencyKey");
  });

  it("retains the release's English descriptions when English is selected", () => {
    vi.stubEnv("PAPERCLIP_LOCALE", "en");
    const help = commands().helpInformation().replace(/\s+/g, " ");
    expect(help).toContain("Start an isolated, initialized Paperclip instance for manual testing");
    expect(help).toContain("Connect an assistant to Paperclip as a consenting human");
    expect(help).toContain("Explicitly send and inspect task-bound AgentMail conversations");
  });
});
