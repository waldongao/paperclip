import { afterEach, describe, expect, it, vi } from "vitest";
import { Command, Option } from "commander";
import { configureLocalizedHelp } from "./cli-help.js";

afterEach(() => { vi.unstubAllEnvs(); });

function command() {
  const program = new Command().name("paperclipai");
  configureLocalizedHelp(program);
  const child = program.command("probe").argument("<path>", "Fixture path");
  child.addOption(new Option("--mode <mode>", "Fixture mode").choices(["safe", "fast"]).default("safe"));
  child.option("--count <count>", "Fixture count", Number, 1);
  return { program, child };
}

describe("localized Commander help", () => {
  it("translates default help labels without changing English help", () => {
    vi.stubEnv("PAPERCLIP_LOCALE", "en");
    const { program, child } = command();
    expect(program.helpInformation()).toContain("Usage: paperclipai [options] [command]");
    expect(child.helpInformation()).toContain("Options:");
    expect(child.helpInformation()).toContain("choices: \"safe\", \"fast\"");
  });

  it("localizes Chinese headings while preserving raw flags, choices and parsed values", () => {
    vi.stubEnv("PAPERCLIP_LOCALE", "zh-CN");
    const { program, child } = command();
    const help = child.helpInformation();
    expect(program.helpInformation()).toContain("probe [选项] <path>");
    expect(program.helpInformation()).not.toContain("[options]");
    expect(help).toContain("用法：");
    expect(help).toContain("选项：");
    expect(help).toContain("可选值：");
    expect(help).toContain("默认值：");
    expect(help).toContain("--mode <mode>");
    expect(help).toContain('"safe", "fast"');
    program.parse(["probe", "./project", "--mode", "fast", "--count", "2"], { from: "user" });
    expect(child.opts()).toEqual({ mode: "fast", count: 2 });
    expect(child.args).toEqual(["./project"]);
    expect(JSON.stringify(child.opts())).toBe('{"mode":"fast","count":2}');
  });

  it("translates Commander errors at display while retaining the parser error code", () => {
    vi.stubEnv("PAPERCLIP_LOCALE", "zh-CN");
    const { program } = command();
    let displayed = "";
    program.configureOutput({ writeErr: (text) => { displayed += text; } }).exitOverride();
    expect(() => program.parse(["--unknown-switch"], { from: "user" })).toThrow(expect.objectContaining({ code: "commander.unknownOption" }));
    expect(displayed).toContain("错误：未知选项 '--unknown-switch'");
  });
});
