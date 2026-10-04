import { Command, Help } from "commander";
import { tCli, translateCliDisplayMessage } from "../i18n.js";

/** Customize display only; flags, command names, choices and parsed values stay intact. */
export function configureLocalizedHelp(program: Command): void {
  const translateMetavariables = (term: string) => term
    .replace(/\[options\]/g, tCli("[options]"))
    .replace(/\[command\]/g, tCli("[command]"));
  const translateExtraLabels = (description: string) => description.replace(
    /(?<=\(|, )(choices|default|preset|env): /g,
    (_match, label: string) => `${tCli(`${label}:`)} `,
  );
  program.configureHelp({
    styleTitle: (title) => tCli(title),
    commandUsage(command) {
      return translateMetavariables(Help.prototype.commandUsage.call(this, command));
    },
    subcommandTerm(command) {
      return translateMetavariables(Help.prototype.subcommandTerm.call(this, command));
    },
    optionDescription(option) {
      return translateExtraLabels(Help.prototype.optionDescription.call(this, option));
    },
    argumentDescription(argument) {
      return translateExtraLabels(Help.prototype.argumentDescription.call(this, argument));
    },
  });
  program.helpOption("-h, --help", tCli("Display help for command"));
  program.addHelpCommand("help [command]", tCli("Display help for command"));
  program.configureOutput({
    outputError: (message, write) => write(message.split("\n").map(translateCliDisplayMessage).join("\n")),
  });
}
