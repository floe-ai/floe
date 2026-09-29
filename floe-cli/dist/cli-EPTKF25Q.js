import { createRequire as __floeCreateRequire } from 'node:module'; const require = __floeCreateRequire(import.meta.url);
import {
  SERVICE_NAMES,
  clearRecords,
  connectIdentity,
  describeVersionMismatch,
  ensureSubstrateForClient,
  floeHome,
  isHealthy,
  isPidRunning,
  probeAgent,
  readRecords,
  recordsPath,
  runningBusVersion,
  serviceLogPath,
  startAll,
  stopService,
  waitForBusHealth
} from "./chunk-6VDGR2FR.js";
import {
  CliOperationClient,
  __commonJS,
  __require,
  __toESM,
  directInstallRequiredMessage,
  ensureConfig,
  ensureLocalDirs,
  external_exports,
  fetchHostControlToken,
  forgetIdentityDeviceKey,
  nativeOperationBroker,
  registerLocalWorkspaceViaBroker,
  require_dist,
  resolveLocalPath,
  selectLocalWorkspace,
  thisInstallation
} from "./chunk-2CSRJ5FI.js";

// node_modules/commander/lib/error.js
var require_error = __commonJS({
  "node_modules/commander/lib/error.js"(exports) {
    var CommanderError2 = class extends Error {
      /**
       * Constructs the CommanderError class
       * @param {number} exitCode suggested exit code which could be used with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       */
      constructor(exitCode, code, message) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.code = code;
        this.exitCode = exitCode;
        this.nestedError = void 0;
      }
    };
    var InvalidArgumentError2 = class extends CommanderError2 {
      /**
       * Constructs the InvalidArgumentError class
       * @param {string} [message] explanation of why argument is invalid
       */
      constructor(message) {
        super(1, "commander.invalidArgument", message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
      }
    };
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
  }
});

// node_modules/commander/lib/argument.js
var require_argument = __commonJS({
  "node_modules/commander/lib/argument.js"(exports) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Argument2 = class {
      /**
       * Initialize a new command argument with the given name and description.
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @param {string} name
       * @param {string} [description]
       */
      constructor(name, description) {
        this.description = description || "";
        this.variadic = false;
        this.parseArg = void 0;
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.argChoices = void 0;
        switch (name[0]) {
          case "<":
            this.required = true;
            this._name = name.slice(1, -1);
            break;
          case "[":
            this.required = false;
            this._name = name.slice(1, -1);
            break;
          default:
            this.required = true;
            this._name = name;
            break;
        }
        if (this._name.length > 3 && this._name.slice(-3) === "...") {
          this.variadic = true;
          this._name = this._name.slice(0, -3);
        }
      }
      /**
       * Return argument name.
       *
       * @return {string}
       */
      name() {
        return this._name;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Argument}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Set the custom handler for processing CLI command arguments into argument values.
       *
       * @param {Function} [fn]
       * @return {Argument}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Only allow argument value to be one of choices.
       *
       * @param {string[]} values
       * @return {Argument}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Make argument required.
       *
       * @returns {Argument}
       */
      argRequired() {
        this.required = true;
        return this;
      }
      /**
       * Make argument optional.
       *
       * @returns {Argument}
       */
      argOptional() {
        this.required = false;
        return this;
      }
    };
    function humanReadableArgName(arg) {
      const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
      return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
    }
    exports.Argument = Argument2;
    exports.humanReadableArgName = humanReadableArgName;
  }
});

// node_modules/commander/lib/help.js
var require_help = __commonJS({
  "node_modules/commander/lib/help.js"(exports) {
    var { humanReadableArgName } = require_argument();
    var Help2 = class {
      constructor() {
        this.helpWidth = void 0;
        this.sortSubcommands = false;
        this.sortOptions = false;
        this.showGlobalOptions = false;
      }
      /**
       * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
       *
       * @param {Command} cmd
       * @returns {Command[]}
       */
      visibleCommands(cmd) {
        const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
        const helpCommand = cmd._getHelpCommand();
        if (helpCommand && !helpCommand._hidden) {
          visibleCommands.push(helpCommand);
        }
        if (this.sortSubcommands) {
          visibleCommands.sort((a, b) => {
            return a.name().localeCompare(b.name());
          });
        }
        return visibleCommands;
      }
      /**
       * Compare options for sort.
       *
       * @param {Option} a
       * @param {Option} b
       * @returns {number}
       */
      compareOptions(a, b) {
        const getSortKey = (option) => {
          return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
        };
        return getSortKey(a).localeCompare(getSortKey(b));
      }
      /**
       * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleOptions(cmd) {
        const visibleOptions = cmd.options.filter((option) => !option.hidden);
        const helpOption = cmd._getHelpOption();
        if (helpOption && !helpOption.hidden) {
          const removeShort = helpOption.short && cmd._findOption(helpOption.short);
          const removeLong = helpOption.long && cmd._findOption(helpOption.long);
          if (!removeShort && !removeLong) {
            visibleOptions.push(helpOption);
          } else if (helpOption.long && !removeLong) {
            visibleOptions.push(
              cmd.createOption(helpOption.long, helpOption.description)
            );
          } else if (helpOption.short && !removeShort) {
            visibleOptions.push(
              cmd.createOption(helpOption.short, helpOption.description)
            );
          }
        }
        if (this.sortOptions) {
          visibleOptions.sort(this.compareOptions);
        }
        return visibleOptions;
      }
      /**
       * Get an array of the visible global options. (Not including help.)
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleGlobalOptions(cmd) {
        if (!this.showGlobalOptions) return [];
        const globalOptions = [];
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          const visibleOptions = ancestorCmd.options.filter(
            (option) => !option.hidden
          );
          globalOptions.push(...visibleOptions);
        }
        if (this.sortOptions) {
          globalOptions.sort(this.compareOptions);
        }
        return globalOptions;
      }
      /**
       * Get an array of the arguments if any have a description.
       *
       * @param {Command} cmd
       * @returns {Argument[]}
       */
      visibleArguments(cmd) {
        if (cmd._argsDescription) {
          cmd.registeredArguments.forEach((argument) => {
            argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
          });
        }
        if (cmd.registeredArguments.find((argument) => argument.description)) {
          return cmd.registeredArguments;
        }
        return [];
      }
      /**
       * Get the command term to show in the list of subcommands.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandTerm(cmd) {
        const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
        return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + // simplistic check for non-help option
        (args ? " " + args : "");
      }
      /**
       * Get the option term to show in the list of options.
       *
       * @param {Option} option
       * @returns {string}
       */
      optionTerm(option) {
        return option.flags;
      }
      /**
       * Get the argument term to show in the list of arguments.
       *
       * @param {Argument} argument
       * @returns {string}
       */
      argumentTerm(argument) {
        return argument.name();
      }
      /**
       * Get the longest command term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestSubcommandTermLength(cmd, helper) {
        return helper.visibleCommands(cmd).reduce((max, command) => {
          return Math.max(max, helper.subcommandTerm(command).length);
        }, 0);
      }
      /**
       * Get the longest option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestOptionTermLength(cmd, helper) {
        return helper.visibleOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest global option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestGlobalOptionTermLength(cmd, helper) {
        return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest argument term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestArgumentTermLength(cmd, helper) {
        return helper.visibleArguments(cmd).reduce((max, argument) => {
          return Math.max(max, helper.argumentTerm(argument).length);
        }, 0);
      }
      /**
       * Get the command usage to be displayed at the top of the built-in help.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandUsage(cmd) {
        let cmdName = cmd._name;
        if (cmd._aliases[0]) {
          cmdName = cmdName + "|" + cmd._aliases[0];
        }
        let ancestorCmdNames = "";
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
        }
        return ancestorCmdNames + cmdName + " " + cmd.usage();
      }
      /**
       * Get the description for the command.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandDescription(cmd) {
        return cmd.description();
      }
      /**
       * Get the subcommand summary to show in the list of subcommands.
       * (Fallback to description for backwards compatibility.)
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandDescription(cmd) {
        return cmd.summary() || cmd.description();
      }
      /**
       * Get the option description to show in the list of options.
       *
       * @param {Option} option
       * @return {string}
       */
      optionDescription(option) {
        const extraInfo = [];
        if (option.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (option.defaultValue !== void 0) {
          const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
          if (showDefault) {
            extraInfo.push(
              `default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`
            );
          }
        }
        if (option.presetArg !== void 0 && option.optional) {
          extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
        }
        if (option.envVar !== void 0) {
          extraInfo.push(`env: ${option.envVar}`);
        }
        if (extraInfo.length > 0) {
          return `${option.description} (${extraInfo.join(", ")})`;
        }
        return option.description;
      }
      /**
       * Get the argument description to show in the list of arguments.
       *
       * @param {Argument} argument
       * @return {string}
       */
      argumentDescription(argument) {
        const extraInfo = [];
        if (argument.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (argument.defaultValue !== void 0) {
          extraInfo.push(
            `default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`
          );
        }
        if (extraInfo.length > 0) {
          const extraDescripton = `(${extraInfo.join(", ")})`;
          if (argument.description) {
            return `${argument.description} ${extraDescripton}`;
          }
          return extraDescripton;
        }
        return argument.description;
      }
      /**
       * Generate the built-in help text.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {string}
       */
      formatHelp(cmd, helper) {
        const termWidth = helper.padWidth(cmd, helper);
        const helpWidth = helper.helpWidth || 80;
        const itemIndentWidth = 2;
        const itemSeparatorWidth = 2;
        function formatItem(term, description) {
          if (description) {
            const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
            return helper.wrap(
              fullText,
              helpWidth - itemIndentWidth,
              termWidth + itemSeparatorWidth
            );
          }
          return term;
        }
        function formatList(textArray) {
          return textArray.join("\n").replace(/^/gm, " ".repeat(itemIndentWidth));
        }
        let output2 = [`Usage: ${helper.commandUsage(cmd)}`, ""];
        const commandDescription = helper.commandDescription(cmd);
        if (commandDescription.length > 0) {
          output2 = output2.concat([
            helper.wrap(commandDescription, helpWidth, 0),
            ""
          ]);
        }
        const argumentList = helper.visibleArguments(cmd).map((argument) => {
          return formatItem(
            helper.argumentTerm(argument),
            helper.argumentDescription(argument)
          );
        });
        if (argumentList.length > 0) {
          output2 = output2.concat(["Arguments:", formatList(argumentList), ""]);
        }
        const optionList = helper.visibleOptions(cmd).map((option) => {
          return formatItem(
            helper.optionTerm(option),
            helper.optionDescription(option)
          );
        });
        if (optionList.length > 0) {
          output2 = output2.concat(["Options:", formatList(optionList), ""]);
        }
        if (this.showGlobalOptions) {
          const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
            return formatItem(
              helper.optionTerm(option),
              helper.optionDescription(option)
            );
          });
          if (globalOptionList.length > 0) {
            output2 = output2.concat([
              "Global Options:",
              formatList(globalOptionList),
              ""
            ]);
          }
        }
        const commandList = helper.visibleCommands(cmd).map((cmd2) => {
          return formatItem(
            helper.subcommandTerm(cmd2),
            helper.subcommandDescription(cmd2)
          );
        });
        if (commandList.length > 0) {
          output2 = output2.concat(["Commands:", formatList(commandList), ""]);
        }
        return output2.join("\n");
      }
      /**
       * Calculate the pad width from the maximum term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      padWidth(cmd, helper) {
        return Math.max(
          helper.longestOptionTermLength(cmd, helper),
          helper.longestGlobalOptionTermLength(cmd, helper),
          helper.longestSubcommandTermLength(cmd, helper),
          helper.longestArgumentTermLength(cmd, helper)
        );
      }
      /**
       * Wrap the given string to width characters per line, with lines after the first indented.
       * Do not wrap if insufficient room for wrapping (minColumnWidth), or string is manually formatted.
       *
       * @param {string} str
       * @param {number} width
       * @param {number} indent
       * @param {number} [minColumnWidth=40]
       * @return {string}
       *
       */
      wrap(str, width, indent, minColumnWidth = 40) {
        const indents = " \\f\\t\\v\xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF";
        const manualIndent = new RegExp(`[\\n][${indents}]+`);
        if (str.match(manualIndent)) return str;
        const columnWidth = width - indent;
        if (columnWidth < minColumnWidth) return str;
        const leadingStr = str.slice(0, indent);
        const columnText = str.slice(indent).replace("\r\n", "\n");
        const indentString = " ".repeat(indent);
        const zeroWidthSpace = "\u200B";
        const breaks = `\\s${zeroWidthSpace}`;
        const regex = new RegExp(
          `
|.{1,${columnWidth - 1}}([${breaks}]|$)|[^${breaks}]+?([${breaks}]|$)`,
          "g"
        );
        const lines = columnText.match(regex) || [];
        return leadingStr + lines.map((line, i) => {
          if (line === "\n") return "";
          return (i > 0 ? indentString : "") + line.trimEnd();
        }).join("\n");
      }
    };
    exports.Help = Help2;
  }
});

// node_modules/commander/lib/option.js
var require_option = __commonJS({
  "node_modules/commander/lib/option.js"(exports) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Option2 = class {
      /**
       * Initialize a new `Option` with the given `flags` and `description`.
       *
       * @param {string} flags
       * @param {string} [description]
       */
      constructor(flags, description) {
        this.flags = flags;
        this.description = description || "";
        this.required = flags.includes("<");
        this.optional = flags.includes("[");
        this.variadic = /\w\.\.\.[>\]]$/.test(flags);
        this.mandatory = false;
        const optionFlags = splitOptionFlags(flags);
        this.short = optionFlags.shortFlag;
        this.long = optionFlags.longFlag;
        this.negate = false;
        if (this.long) {
          this.negate = this.long.startsWith("--no-");
        }
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.presetArg = void 0;
        this.envVar = void 0;
        this.parseArg = void 0;
        this.hidden = false;
        this.argChoices = void 0;
        this.conflictsWith = [];
        this.implied = void 0;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Option}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Preset to use when option used without option-argument, especially optional but also boolean and negated.
       * The custom processing (parseArg) is called.
       *
       * @example
       * new Option('--color').default('GREYSCALE').preset('RGB');
       * new Option('--donate [amount]').preset('20').argParser(parseFloat);
       *
       * @param {*} arg
       * @return {Option}
       */
      preset(arg) {
        this.presetArg = arg;
        return this;
      }
      /**
       * Add option name(s) that conflict with this option.
       * An error will be displayed if conflicting options are found during parsing.
       *
       * @example
       * new Option('--rgb').conflicts('cmyk');
       * new Option('--js').conflicts(['ts', 'jsx']);
       *
       * @param {(string | string[])} names
       * @return {Option}
       */
      conflicts(names) {
        this.conflictsWith = this.conflictsWith.concat(names);
        return this;
      }
      /**
       * Specify implied option values for when this option is set and the implied options are not.
       *
       * The custom processing (parseArg) is not called on the implied values.
       *
       * @example
       * program
       *   .addOption(new Option('--log', 'write logging information to file'))
       *   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
       *
       * @param {object} impliedOptionValues
       * @return {Option}
       */
      implies(impliedOptionValues) {
        let newImplied = impliedOptionValues;
        if (typeof impliedOptionValues === "string") {
          newImplied = { [impliedOptionValues]: true };
        }
        this.implied = Object.assign(this.implied || {}, newImplied);
        return this;
      }
      /**
       * Set environment variable to check for option value.
       *
       * An environment variable is only used if when processed the current option value is
       * undefined, or the source of the current value is 'default' or 'config' or 'env'.
       *
       * @param {string} name
       * @return {Option}
       */
      env(name) {
        this.envVar = name;
        return this;
      }
      /**
       * Set the custom handler for processing CLI option arguments into option values.
       *
       * @param {Function} [fn]
       * @return {Option}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Whether the option is mandatory and must have a value after parsing.
       *
       * @param {boolean} [mandatory=true]
       * @return {Option}
       */
      makeOptionMandatory(mandatory = true) {
        this.mandatory = !!mandatory;
        return this;
      }
      /**
       * Hide option in help.
       *
       * @param {boolean} [hide=true]
       * @return {Option}
       */
      hideHelp(hide = true) {
        this.hidden = !!hide;
        return this;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Only allow option value to be one of choices.
       *
       * @param {string[]} values
       * @return {Option}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Return option name.
       *
       * @return {string}
       */
      name() {
        if (this.long) {
          return this.long.replace(/^--/, "");
        }
        return this.short.replace(/^-/, "");
      }
      /**
       * Return option name, in a camelcase format that can be used
       * as a object attribute key.
       *
       * @return {string}
       */
      attributeName() {
        return camelcase(this.name().replace(/^no-/, ""));
      }
      /**
       * Check if `arg` matches the short or long flag.
       *
       * @param {string} arg
       * @return {boolean}
       * @package
       */
      is(arg) {
        return this.short === arg || this.long === arg;
      }
      /**
       * Return whether a boolean option.
       *
       * Options are one of boolean, negated, required argument, or optional argument.
       *
       * @return {boolean}
       * @package
       */
      isBoolean() {
        return !this.required && !this.optional && !this.negate;
      }
    };
    var DualOptions = class {
      /**
       * @param {Option[]} options
       */
      constructor(options) {
        this.positiveOptions = /* @__PURE__ */ new Map();
        this.negativeOptions = /* @__PURE__ */ new Map();
        this.dualOptions = /* @__PURE__ */ new Set();
        options.forEach((option) => {
          if (option.negate) {
            this.negativeOptions.set(option.attributeName(), option);
          } else {
            this.positiveOptions.set(option.attributeName(), option);
          }
        });
        this.negativeOptions.forEach((value, key) => {
          if (this.positiveOptions.has(key)) {
            this.dualOptions.add(key);
          }
        });
      }
      /**
       * Did the value come from the option, and not from possible matching dual option?
       *
       * @param {*} value
       * @param {Option} option
       * @returns {boolean}
       */
      valueFromOption(value, option) {
        const optionKey = option.attributeName();
        if (!this.dualOptions.has(optionKey)) return true;
        const preset = this.negativeOptions.get(optionKey).presetArg;
        const negativeValue = preset !== void 0 ? preset : false;
        return option.negate === (negativeValue === value);
      }
    };
    function camelcase(str) {
      return str.split("-").reduce((str2, word) => {
        return str2 + word[0].toUpperCase() + word.slice(1);
      });
    }
    function splitOptionFlags(flags) {
      let shortFlag;
      let longFlag;
      const flagParts = flags.split(/[ |,]+/);
      if (flagParts.length > 1 && !/^[[<]/.test(flagParts[1]))
        shortFlag = flagParts.shift();
      longFlag = flagParts.shift();
      if (!shortFlag && /^-[^-]$/.test(longFlag)) {
        shortFlag = longFlag;
        longFlag = void 0;
      }
      return { shortFlag, longFlag };
    }
    exports.Option = Option2;
    exports.DualOptions = DualOptions;
  }
});

// node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS({
  "node_modules/commander/lib/suggestSimilar.js"(exports) {
    var maxDistance = 3;
    function editDistance(a, b) {
      if (Math.abs(a.length - b.length) > maxDistance)
        return Math.max(a.length, b.length);
      const d = [];
      for (let i = 0; i <= a.length; i++) {
        d[i] = [i];
      }
      for (let j = 0; j <= b.length; j++) {
        d[0][j] = j;
      }
      for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
          let cost = 1;
          if (a[i - 1] === b[j - 1]) {
            cost = 0;
          } else {
            cost = 1;
          }
          d[i][j] = Math.min(
            d[i - 1][j] + 1,
            // deletion
            d[i][j - 1] + 1,
            // insertion
            d[i - 1][j - 1] + cost
            // substitution
          );
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
            d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
          }
        }
      }
      return d[a.length][b.length];
    }
    function suggestSimilar(word, candidates) {
      if (!candidates || candidates.length === 0) return "";
      candidates = Array.from(new Set(candidates));
      const searchingOptions = word.startsWith("--");
      if (searchingOptions) {
        word = word.slice(2);
        candidates = candidates.map((candidate) => candidate.slice(2));
      }
      let similar = [];
      let bestDistance = maxDistance;
      const minSimilarity = 0.4;
      candidates.forEach((candidate) => {
        if (candidate.length <= 1) return;
        const distance = editDistance(word, candidate);
        const length = Math.max(word.length, candidate.length);
        const similarity = (length - distance) / length;
        if (similarity > minSimilarity) {
          if (distance < bestDistance) {
            bestDistance = distance;
            similar = [candidate];
          } else if (distance === bestDistance) {
            similar.push(candidate);
          }
        }
      });
      similar.sort((a, b) => a.localeCompare(b));
      if (searchingOptions) {
        similar = similar.map((candidate) => `--${candidate}`);
      }
      if (similar.length > 1) {
        return `
(Did you mean one of ${similar.join(", ")}?)`;
      }
      if (similar.length === 1) {
        return `
(Did you mean ${similar[0]}?)`;
      }
      return "";
    }
    exports.suggestSimilar = suggestSimilar;
  }
});

// node_modules/commander/lib/command.js
var require_command = __commonJS({
  "node_modules/commander/lib/command.js"(exports) {
    var EventEmitter = __require("node:events").EventEmitter;
    var childProcess = __require("node:child_process");
    var path = __require("node:path");
    var fs = __require("node:fs");
    var process2 = __require("node:process");
    var { Argument: Argument2, humanReadableArgName } = require_argument();
    var { CommanderError: CommanderError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2, DualOptions } = require_option();
    var { suggestSimilar } = require_suggestSimilar();
    var Command2 = class _Command extends EventEmitter {
      /**
       * Initialize a new `Command`.
       *
       * @param {string} [name]
       */
      constructor(name) {
        super();
        this.commands = [];
        this.options = [];
        this.parent = null;
        this._allowUnknownOption = false;
        this._allowExcessArguments = true;
        this.registeredArguments = [];
        this._args = this.registeredArguments;
        this.args = [];
        this.rawArgs = [];
        this.processedArgs = [];
        this._scriptPath = null;
        this._name = name || "";
        this._optionValues = {};
        this._optionValueSources = {};
        this._storeOptionsAsProperties = false;
        this._actionHandler = null;
        this._executableHandler = false;
        this._executableFile = null;
        this._executableDir = null;
        this._defaultCommandName = null;
        this._exitCallback = null;
        this._aliases = [];
        this._combineFlagAndOptionalValue = true;
        this._description = "";
        this._summary = "";
        this._argsDescription = void 0;
        this._enablePositionalOptions = false;
        this._passThroughOptions = false;
        this._lifeCycleHooks = {};
        this._showHelpAfterError = false;
        this._showSuggestionAfterError = true;
        this._outputConfiguration = {
          writeOut: (str) => process2.stdout.write(str),
          writeErr: (str) => process2.stderr.write(str),
          getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : void 0,
          getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : void 0,
          outputError: (str, write2) => write2(str)
        };
        this._hidden = false;
        this._helpOption = void 0;
        this._addImplicitHelpCommand = void 0;
        this._helpCommand = void 0;
        this._helpConfiguration = {};
      }
      /**
       * Copy settings that are useful to have in common across root command and subcommands.
       *
       * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
       *
       * @param {Command} sourceCommand
       * @return {Command} `this` command for chaining
       */
      copyInheritedSettings(sourceCommand) {
        this._outputConfiguration = sourceCommand._outputConfiguration;
        this._helpOption = sourceCommand._helpOption;
        this._helpCommand = sourceCommand._helpCommand;
        this._helpConfiguration = sourceCommand._helpConfiguration;
        this._exitCallback = sourceCommand._exitCallback;
        this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
        this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
        this._allowExcessArguments = sourceCommand._allowExcessArguments;
        this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
        this._showHelpAfterError = sourceCommand._showHelpAfterError;
        this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
        return this;
      }
      /**
       * @returns {Command[]}
       * @private
       */
      _getCommandAndAncestors() {
        const result = [];
        for (let command = this; command; command = command.parent) {
          result.push(command);
        }
        return result;
      }
      /**
       * Define a command.
       *
       * There are two styles of command: pay attention to where to put the description.
       *
       * @example
       * // Command implemented using action handler (description is supplied separately to `.command`)
       * program
       *   .command('clone <source> [destination]')
       *   .description('clone a repository into a newly created directory')
       *   .action((source, destination) => {
       *     console.log('clone command called');
       *   });
       *
       * // Command implemented using separate executable file (description is second parameter to `.command`)
       * program
       *   .command('start <service>', 'start named service')
       *   .command('stop [service]', 'stop named service, or all if no name supplied');
       *
       * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
       * @param {(object | string)} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
       * @param {object} [execOpts] - configuration options (for executable)
       * @return {Command} returns new command for action handler, or `this` for executable command
       */
      command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
        let desc = actionOptsOrExecDesc;
        let opts = execOpts;
        if (typeof desc === "object" && desc !== null) {
          opts = desc;
          desc = null;
        }
        opts = opts || {};
        const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const cmd = this.createCommand(name);
        if (desc) {
          cmd.description(desc);
          cmd._executableHandler = true;
        }
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        cmd._hidden = !!(opts.noHelp || opts.hidden);
        cmd._executableFile = opts.executableFile || null;
        if (args) cmd.arguments(args);
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd.copyInheritedSettings(this);
        if (desc) return this;
        return cmd;
      }
      /**
       * Factory routine to create a new unattached command.
       *
       * See .command() for creating an attached subcommand, which uses this routine to
       * create the command. You can override createCommand to customise subcommands.
       *
       * @param {string} [name]
       * @return {Command} new command
       */
      createCommand(name) {
        return new _Command(name);
      }
      /**
       * You can customise the help with a subclass of Help by overriding createHelp,
       * or by overriding Help properties using configureHelp().
       *
       * @return {Help}
       */
      createHelp() {
        return Object.assign(new Help2(), this.configureHelp());
      }
      /**
       * You can customise the help by overriding Help properties using configureHelp(),
       * or with a subclass of Help by overriding createHelp().
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureHelp(configuration) {
        if (configuration === void 0) return this._helpConfiguration;
        this._helpConfiguration = configuration;
        return this;
      }
      /**
       * The default output goes to stdout and stderr. You can customise this for special
       * applications. You can also customise the display of errors by overriding outputError.
       *
       * The configuration properties are all functions:
       *
       *     // functions to change where being written, stdout and stderr
       *     writeOut(str)
       *     writeErr(str)
       *     // matching functions to specify width for wrapping help
       *     getOutHelpWidth()
       *     getErrHelpWidth()
       *     // functions based on what is being written out
       *     outputError(str, write) // used for displaying errors, and not used for displaying help
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureOutput(configuration) {
        if (configuration === void 0) return this._outputConfiguration;
        Object.assign(this._outputConfiguration, configuration);
        return this;
      }
      /**
       * Display the help or a custom message after an error occurs.
       *
       * @param {(boolean|string)} [displayHelp]
       * @return {Command} `this` command for chaining
       */
      showHelpAfterError(displayHelp = true) {
        if (typeof displayHelp !== "string") displayHelp = !!displayHelp;
        this._showHelpAfterError = displayHelp;
        return this;
      }
      /**
       * Display suggestion of similar commands for unknown commands, or options for unknown options.
       *
       * @param {boolean} [displaySuggestion]
       * @return {Command} `this` command for chaining
       */
      showSuggestionAfterError(displaySuggestion = true) {
        this._showSuggestionAfterError = !!displaySuggestion;
        return this;
      }
      /**
       * Add a prepared subcommand.
       *
       * See .command() for creating an attached subcommand which inherits settings from its parent.
       *
       * @param {Command} cmd - new subcommand
       * @param {object} [opts] - configuration options
       * @return {Command} `this` command for chaining
       */
      addCommand(cmd, opts) {
        if (!cmd._name) {
          throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
        }
        opts = opts || {};
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        if (opts.noHelp || opts.hidden) cmd._hidden = true;
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd._checkForBrokenPassThrough();
        return this;
      }
      /**
       * Factory routine to create a new unattached argument.
       *
       * See .argument() for creating an attached argument, which uses this routine to
       * create the argument. You can override createArgument to return a custom argument.
       *
       * @param {string} name
       * @param {string} [description]
       * @return {Argument} new argument
       */
      createArgument(name, description) {
        return new Argument2(name, description);
      }
      /**
       * Define argument syntax for command.
       *
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @example
       * program.argument('<input-file>');
       * program.argument('[output-file]');
       *
       * @param {string} name
       * @param {string} [description]
       * @param {(Function|*)} [fn] - custom argument processing function
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      argument(name, description, fn, defaultValue) {
        const argument = this.createArgument(name, description);
        if (typeof fn === "function") {
          argument.default(defaultValue).argParser(fn);
        } else {
          argument.default(fn);
        }
        this.addArgument(argument);
        return this;
      }
      /**
       * Define argument syntax for command, adding multiple at once (without descriptions).
       *
       * See also .argument().
       *
       * @example
       * program.arguments('<cmd> [env]');
       *
       * @param {string} names
       * @return {Command} `this` command for chaining
       */
      arguments(names) {
        names.trim().split(/ +/).forEach((detail) => {
          this.argument(detail);
        });
        return this;
      }
      /**
       * Define argument syntax for command, adding a prepared argument.
       *
       * @param {Argument} argument
       * @return {Command} `this` command for chaining
       */
      addArgument(argument) {
        const previousArgument = this.registeredArguments.slice(-1)[0];
        if (previousArgument && previousArgument.variadic) {
          throw new Error(
            `only the last argument can be variadic '${previousArgument.name()}'`
          );
        }
        if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) {
          throw new Error(
            `a default value for a required argument is never used: '${argument.name()}'`
          );
        }
        this.registeredArguments.push(argument);
        return this;
      }
      /**
       * Customise or override default help command. By default a help command is automatically added if your command has subcommands.
       *
       * @example
       *    program.helpCommand('help [cmd]');
       *    program.helpCommand('help [cmd]', 'show help');
       *    program.helpCommand(false); // suppress default help command
       *    program.helpCommand(true); // add help command even if no subcommands
       *
       * @param {string|boolean} enableOrNameAndArgs - enable with custom name and/or arguments, or boolean to override whether added
       * @param {string} [description] - custom description
       * @return {Command} `this` command for chaining
       */
      helpCommand(enableOrNameAndArgs, description) {
        if (typeof enableOrNameAndArgs === "boolean") {
          this._addImplicitHelpCommand = enableOrNameAndArgs;
          return this;
        }
        enableOrNameAndArgs = enableOrNameAndArgs ?? "help [command]";
        const [, helpName, helpArgs] = enableOrNameAndArgs.match(/([^ ]+) *(.*)/);
        const helpDescription = description ?? "display help for command";
        const helpCommand = this.createCommand(helpName);
        helpCommand.helpOption(false);
        if (helpArgs) helpCommand.arguments(helpArgs);
        if (helpDescription) helpCommand.description(helpDescription);
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Add prepared custom help command.
       *
       * @param {(Command|string|boolean)} helpCommand - custom help command, or deprecated enableOrNameAndArgs as for `.helpCommand()`
       * @param {string} [deprecatedDescription] - deprecated custom description used with custom name only
       * @return {Command} `this` command for chaining
       */
      addHelpCommand(helpCommand, deprecatedDescription) {
        if (typeof helpCommand !== "object") {
          this.helpCommand(helpCommand, deprecatedDescription);
          return this;
        }
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Lazy create help command.
       *
       * @return {(Command|null)}
       * @package
       */
      _getHelpCommand() {
        const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
        if (hasImplicitHelpCommand) {
          if (this._helpCommand === void 0) {
            this.helpCommand(void 0, void 0);
          }
          return this._helpCommand;
        }
        return null;
      }
      /**
       * Add hook for life cycle event.
       *
       * @param {string} event
       * @param {Function} listener
       * @return {Command} `this` command for chaining
       */
      hook(event, listener) {
        const allowedValues = ["preSubcommand", "preAction", "postAction"];
        if (!allowedValues.includes(event)) {
          throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        if (this._lifeCycleHooks[event]) {
          this._lifeCycleHooks[event].push(listener);
        } else {
          this._lifeCycleHooks[event] = [listener];
        }
        return this;
      }
      /**
       * Register callback to use as replacement for calling process.exit.
       *
       * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
       * @return {Command} `this` command for chaining
       */
      exitOverride(fn) {
        if (fn) {
          this._exitCallback = fn;
        } else {
          this._exitCallback = (err) => {
            if (err.code !== "commander.executeSubCommandAsync") {
              throw err;
            } else {
            }
          };
        }
        return this;
      }
      /**
       * Call process.exit, and _exitCallback if defined.
       *
       * @param {number} exitCode exit code for using with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       * @return never
       * @private
       */
      _exit(exitCode, code, message) {
        if (this._exitCallback) {
          this._exitCallback(new CommanderError2(exitCode, code, message));
        }
        process2.exit(exitCode);
      }
      /**
       * Register callback `fn` for the command.
       *
       * @example
       * program
       *   .command('serve')
       *   .description('start service')
       *   .action(function() {
       *      // do work here
       *   });
       *
       * @param {Function} fn
       * @return {Command} `this` command for chaining
       */
      action(fn) {
        const listener = (args) => {
          const expectedArgsCount = this.registeredArguments.length;
          const actionArgs = args.slice(0, expectedArgsCount);
          if (this._storeOptionsAsProperties) {
            actionArgs[expectedArgsCount] = this;
          } else {
            actionArgs[expectedArgsCount] = this.opts();
          }
          actionArgs.push(this);
          return fn.apply(this, actionArgs);
        };
        this._actionHandler = listener;
        return this;
      }
      /**
       * Factory routine to create a new unattached option.
       *
       * See .option() for creating an attached option, which uses this routine to
       * create the option. You can override createOption to return a custom option.
       *
       * @param {string} flags
       * @param {string} [description]
       * @return {Option} new option
       */
      createOption(flags, description) {
        return new Option2(flags, description);
      }
      /**
       * Wrap parseArgs to catch 'commander.invalidArgument'.
       *
       * @param {(Option | Argument)} target
       * @param {string} value
       * @param {*} previous
       * @param {string} invalidArgumentMessage
       * @private
       */
      _callParseArg(target, value, previous, invalidArgumentMessage) {
        try {
          return target.parseArg(value, previous);
        } catch (err) {
          if (err.code === "commander.invalidArgument") {
            const message = `${invalidArgumentMessage} ${err.message}`;
            this.error(message, { exitCode: err.exitCode, code: err.code });
          }
          throw err;
        }
      }
      /**
       * Check for option flag conflicts.
       * Register option if no conflicts found, or throw on conflict.
       *
       * @param {Option} option
       * @private
       */
      _registerOption(option) {
        const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
        if (matchingOption) {
          const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
          throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
        }
        this.options.push(option);
      }
      /**
       * Check for command name and alias conflicts with existing commands.
       * Register command if no conflicts found, or throw on conflict.
       *
       * @param {Command} command
       * @private
       */
      _registerCommand(command) {
        const knownBy = (cmd) => {
          return [cmd.name()].concat(cmd.aliases());
        };
        const alreadyUsed = knownBy(command).find(
          (name) => this._findCommand(name)
        );
        if (alreadyUsed) {
          const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
          const newCmd = knownBy(command).join("|");
          throw new Error(
            `cannot add command '${newCmd}' as already have command '${existingCmd}'`
          );
        }
        this.commands.push(command);
      }
      /**
       * Add an option.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addOption(option) {
        this._registerOption(option);
        const oname = option.name();
        const name = option.attributeName();
        if (option.negate) {
          const positiveLongFlag = option.long.replace(/^--no-/, "--");
          if (!this._findOption(positiveLongFlag)) {
            this.setOptionValueWithSource(
              name,
              option.defaultValue === void 0 ? true : option.defaultValue,
              "default"
            );
          }
        } else if (option.defaultValue !== void 0) {
          this.setOptionValueWithSource(name, option.defaultValue, "default");
        }
        const handleOptionValue = (val, invalidValueMessage, valueSource) => {
          if (val == null && option.presetArg !== void 0) {
            val = option.presetArg;
          }
          const oldValue = this.getOptionValue(name);
          if (val !== null && option.parseArg) {
            val = this._callParseArg(option, val, oldValue, invalidValueMessage);
          } else if (val !== null && option.variadic) {
            val = option._concatValue(val, oldValue);
          }
          if (val == null) {
            if (option.negate) {
              val = false;
            } else if (option.isBoolean() || option.optional) {
              val = true;
            } else {
              val = "";
            }
          }
          this.setOptionValueWithSource(name, val, valueSource);
        };
        this.on("option:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "cli");
        });
        if (option.envVar) {
          this.on("optionEnv:" + oname, (val) => {
            const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
            handleOptionValue(val, invalidValueMessage, "env");
          });
        }
        return this;
      }
      /**
       * Internal implementation shared by .option() and .requiredOption()
       *
       * @return {Command} `this` command for chaining
       * @private
       */
      _optionEx(config, flags, description, fn, defaultValue) {
        if (typeof flags === "object" && flags instanceof Option2) {
          throw new Error(
            "To add an Option object use addOption() instead of option() or requiredOption()"
          );
        }
        const option = this.createOption(flags, description);
        option.makeOptionMandatory(!!config.mandatory);
        if (typeof fn === "function") {
          option.default(defaultValue).argParser(fn);
        } else if (fn instanceof RegExp) {
          const regex = fn;
          fn = (val, def) => {
            const m = regex.exec(val);
            return m ? m[0] : def;
          };
          option.default(defaultValue).argParser(fn);
        } else {
          option.default(fn);
        }
        return this.addOption(option);
      }
      /**
       * Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
       * option-argument is indicated by `<>` and an optional option-argument by `[]`.
       *
       * See the README for more details, and see also addOption() and requiredOption().
       *
       * @example
       * program
       *     .option('-p, --pepper', 'add pepper')
       *     .option('-p, --pizza-type <TYPE>', 'type of pizza') // required option-argument
       *     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
       *     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      option(flags, description, parseArg, defaultValue) {
        return this._optionEx({}, flags, description, parseArg, defaultValue);
      }
      /**
       * Add a required option which must have a value after parsing. This usually means
       * the option must be specified on the command line. (Otherwise the same as .option().)
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      requiredOption(flags, description, parseArg, defaultValue) {
        return this._optionEx(
          { mandatory: true },
          flags,
          description,
          parseArg,
          defaultValue
        );
      }
      /**
       * Alter parsing of short flags with optional values.
       *
       * @example
       * // for `.option('-f,--flag [value]'):
       * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
       * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
       *
       * @param {boolean} [combine] - if `true` or omitted, an optional value can be specified directly after the flag.
       * @return {Command} `this` command for chaining
       */
      combineFlagAndOptionalValue(combine = true) {
        this._combineFlagAndOptionalValue = !!combine;
        return this;
      }
      /**
       * Allow unknown options on the command line.
       *
       * @param {boolean} [allowUnknown] - if `true` or omitted, no error will be thrown for unknown options.
       * @return {Command} `this` command for chaining
       */
      allowUnknownOption(allowUnknown = true) {
        this._allowUnknownOption = !!allowUnknown;
        return this;
      }
      /**
       * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
       *
       * @param {boolean} [allowExcess] - if `true` or omitted, no error will be thrown for excess arguments.
       * @return {Command} `this` command for chaining
       */
      allowExcessArguments(allowExcess = true) {
        this._allowExcessArguments = !!allowExcess;
        return this;
      }
      /**
       * Enable positional options. Positional means global options are specified before subcommands which lets
       * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
       * The default behaviour is non-positional and global options may appear anywhere on the command line.
       *
       * @param {boolean} [positional]
       * @return {Command} `this` command for chaining
       */
      enablePositionalOptions(positional = true) {
        this._enablePositionalOptions = !!positional;
        return this;
      }
      /**
       * Pass through options that come after command-arguments rather than treat them as command-options,
       * so actual command-options come before command-arguments. Turning this on for a subcommand requires
       * positional options to have been enabled on the program (parent commands).
       * The default behaviour is non-positional and options may appear before or after command-arguments.
       *
       * @param {boolean} [passThrough] for unknown options.
       * @return {Command} `this` command for chaining
       */
      passThroughOptions(passThrough = true) {
        this._passThroughOptions = !!passThrough;
        this._checkForBrokenPassThrough();
        return this;
      }
      /**
       * @private
       */
      _checkForBrokenPassThrough() {
        if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
          throw new Error(
            `passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`
          );
        }
      }
      /**
       * Whether to store option values as properties on command object,
       * or store separately (specify false). In both cases the option values can be accessed using .opts().
       *
       * @param {boolean} [storeAsProperties=true]
       * @return {Command} `this` command for chaining
       */
      storeOptionsAsProperties(storeAsProperties = true) {
        if (this.options.length) {
          throw new Error("call .storeOptionsAsProperties() before adding options");
        }
        if (Object.keys(this._optionValues).length) {
          throw new Error(
            "call .storeOptionsAsProperties() before setting option values"
          );
        }
        this._storeOptionsAsProperties = !!storeAsProperties;
        return this;
      }
      /**
       * Retrieve option value.
       *
       * @param {string} key
       * @return {object} value
       */
      getOptionValue(key) {
        if (this._storeOptionsAsProperties) {
          return this[key];
        }
        return this._optionValues[key];
      }
      /**
       * Store option value.
       *
       * @param {string} key
       * @param {object} value
       * @return {Command} `this` command for chaining
       */
      setOptionValue(key, value) {
        return this.setOptionValueWithSource(key, value, void 0);
      }
      /**
       * Store option value and where the value came from.
       *
       * @param {string} key
       * @param {object} value
       * @param {string} source - expected values are default/config/env/cli/implied
       * @return {Command} `this` command for chaining
       */
      setOptionValueWithSource(key, value, source) {
        if (this._storeOptionsAsProperties) {
          this[key] = value;
        } else {
          this._optionValues[key] = value;
        }
        this._optionValueSources[key] = source;
        return this;
      }
      /**
       * Get source of option value.
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSource(key) {
        return this._optionValueSources[key];
      }
      /**
       * Get source of option value. See also .optsWithGlobals().
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSourceWithGlobals(key) {
        let source;
        this._getCommandAndAncestors().forEach((cmd) => {
          if (cmd.getOptionValueSource(key) !== void 0) {
            source = cmd.getOptionValueSource(key);
          }
        });
        return source;
      }
      /**
       * Get user arguments from implied or explicit arguments.
       * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
       *
       * @private
       */
      _prepareUserArgs(argv, parseOptions) {
        if (argv !== void 0 && !Array.isArray(argv)) {
          throw new Error("first parameter to parse must be array or undefined");
        }
        parseOptions = parseOptions || {};
        if (argv === void 0 && parseOptions.from === void 0) {
          if (process2.versions?.electron) {
            parseOptions.from = "electron";
          }
          const execArgv = process2.execArgv ?? [];
          if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
            parseOptions.from = "eval";
          }
        }
        if (argv === void 0) {
          argv = process2.argv;
        }
        this.rawArgs = argv.slice();
        let userArgs;
        switch (parseOptions.from) {
          case void 0:
          case "node":
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
            break;
          case "electron":
            if (process2.defaultApp) {
              this._scriptPath = argv[1];
              userArgs = argv.slice(2);
            } else {
              userArgs = argv.slice(1);
            }
            break;
          case "user":
            userArgs = argv.slice(0);
            break;
          case "eval":
            userArgs = argv.slice(1);
            break;
          default:
            throw new Error(
              `unexpected parse option { from: '${parseOptions.from}' }`
            );
        }
        if (!this._name && this._scriptPath)
          this.nameFromFilename(this._scriptPath);
        this._name = this._name || "program";
        return userArgs;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Use parseAsync instead of parse if any of your action handlers are async.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * program.parse(); // parse process.argv and auto-detect electron and special node flags
       * program.parse(process.argv); // assume argv[0] is app and argv[1] is script
       * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv] - optional, defaults to process.argv
       * @param {object} [parseOptions] - optionally specify style of options with from: node/user/electron
       * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
       * @return {Command} `this` command for chaining
       */
      parse(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * await program.parseAsync(); // parse process.argv and auto-detect electron and special node flags
       * await program.parseAsync(process.argv); // assume argv[0] is app and argv[1] is script
       * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv]
       * @param {object} [parseOptions]
       * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
       * @return {Promise}
       */
      async parseAsync(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        await this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Execute a sub-command executable.
       *
       * @private
       */
      _executeSubCommand(subcommand, args) {
        args = args.slice();
        let launchWithNode = false;
        const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
        function findFile(baseDir, baseName) {
          const localBin = path.resolve(baseDir, baseName);
          if (fs.existsSync(localBin)) return localBin;
          if (sourceExt.includes(path.extname(baseName))) return void 0;
          const foundExt = sourceExt.find(
            (ext) => fs.existsSync(`${localBin}${ext}`)
          );
          if (foundExt) return `${localBin}${foundExt}`;
          return void 0;
        }
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
        let executableDir = this._executableDir || "";
        if (this._scriptPath) {
          let resolvedScriptPath;
          try {
            resolvedScriptPath = fs.realpathSync(this._scriptPath);
          } catch (err) {
            resolvedScriptPath = this._scriptPath;
          }
          executableDir = path.resolve(
            path.dirname(resolvedScriptPath),
            executableDir
          );
        }
        if (executableDir) {
          let localFile = findFile(executableDir, executableFile);
          if (!localFile && !subcommand._executableFile && this._scriptPath) {
            const legacyName = path.basename(
              this._scriptPath,
              path.extname(this._scriptPath)
            );
            if (legacyName !== this._name) {
              localFile = findFile(
                executableDir,
                `${legacyName}-${subcommand._name}`
              );
            }
          }
          executableFile = localFile || executableFile;
        }
        launchWithNode = sourceExt.includes(path.extname(executableFile));
        let proc;
        if (process2.platform !== "win32") {
          if (launchWithNode) {
            args.unshift(executableFile);
            args = incrementNodeInspectorPort(process2.execArgv).concat(args);
            proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
          } else {
            proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
          }
        } else {
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process2.execArgv).concat(args);
          proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
        }
        if (!proc.killed) {
          const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
          signals.forEach((signal) => {
            process2.on(signal, () => {
              if (proc.killed === false && proc.exitCode === null) {
                proc.kill(signal);
              }
            });
          });
        }
        const exitCallback = this._exitCallback;
        proc.on("close", (code) => {
          code = code ?? 1;
          if (!exitCallback) {
            process2.exit(code);
          } else {
            exitCallback(
              new CommanderError2(
                code,
                "commander.executeSubCommandAsync",
                "(close)"
              )
            );
          }
        });
        proc.on("error", (err) => {
          if (err.code === "ENOENT") {
            const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
            const executableMissing = `'${executableFile}' does not exist
 - if '${subcommand._name}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
            throw new Error(executableMissing);
          } else if (err.code === "EACCES") {
            throw new Error(`'${executableFile}' not executable`);
          }
          if (!exitCallback) {
            process2.exit(1);
          } else {
            const wrappedError = new CommanderError2(
              1,
              "commander.executeSubCommandAsync",
              "(error)"
            );
            wrappedError.nestedError = err;
            exitCallback(wrappedError);
          }
        });
        this.runningCommand = proc;
      }
      /**
       * @private
       */
      _dispatchSubcommand(commandName, operands, unknown) {
        const subCommand = this._findCommand(commandName);
        if (!subCommand) this.help({ error: true });
        let promiseChain;
        promiseChain = this._chainOrCallSubCommandHook(
          promiseChain,
          subCommand,
          "preSubcommand"
        );
        promiseChain = this._chainOrCall(promiseChain, () => {
          if (subCommand._executableHandler) {
            this._executeSubCommand(subCommand, operands.concat(unknown));
          } else {
            return subCommand._parseCommand(operands, unknown);
          }
        });
        return promiseChain;
      }
      /**
       * Invoke help directly if possible, or dispatch if necessary.
       * e.g. help foo
       *
       * @private
       */
      _dispatchHelpCommand(subcommandName) {
        if (!subcommandName) {
          this.help();
        }
        const subCommand = this._findCommand(subcommandName);
        if (subCommand && !subCommand._executableHandler) {
          subCommand.help();
        }
        return this._dispatchSubcommand(
          subcommandName,
          [],
          [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]
        );
      }
      /**
       * Check this.args against expected this.registeredArguments.
       *
       * @private
       */
      _checkNumberOfArguments() {
        this.registeredArguments.forEach((arg, i) => {
          if (arg.required && this.args[i] == null) {
            this.missingArgument(arg.name());
          }
        });
        if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
          return;
        }
        if (this.args.length > this.registeredArguments.length) {
          this._excessArguments(this.args);
        }
      }
      /**
       * Process this.args using this.registeredArguments and save as this.processedArgs!
       *
       * @private
       */
      _processArguments() {
        const myParseArg = (argument, value, previous) => {
          let parsedValue = value;
          if (value !== null && argument.parseArg) {
            const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
            parsedValue = this._callParseArg(
              argument,
              value,
              previous,
              invalidValueMessage
            );
          }
          return parsedValue;
        };
        this._checkNumberOfArguments();
        const processedArgs = [];
        this.registeredArguments.forEach((declaredArg, index) => {
          let value = declaredArg.defaultValue;
          if (declaredArg.variadic) {
            if (index < this.args.length) {
              value = this.args.slice(index);
              if (declaredArg.parseArg) {
                value = value.reduce((processed, v) => {
                  return myParseArg(declaredArg, v, processed);
                }, declaredArg.defaultValue);
              }
            } else if (value === void 0) {
              value = [];
            }
          } else if (index < this.args.length) {
            value = this.args[index];
            if (declaredArg.parseArg) {
              value = myParseArg(declaredArg, value, declaredArg.defaultValue);
            }
          }
          processedArgs[index] = value;
        });
        this.processedArgs = processedArgs;
      }
      /**
       * Once we have a promise we chain, but call synchronously until then.
       *
       * @param {(Promise|undefined)} promise
       * @param {Function} fn
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCall(promise, fn) {
        if (promise && promise.then && typeof promise.then === "function") {
          return promise.then(() => fn());
        }
        return fn();
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallHooks(promise, event) {
        let result = promise;
        const hooks = [];
        this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
          hookedCommand._lifeCycleHooks[event].forEach((callback) => {
            hooks.push({ hookedCommand, callback });
          });
        });
        if (event === "postAction") {
          hooks.reverse();
        }
        hooks.forEach((hookDetail) => {
          result = this._chainOrCall(result, () => {
            return hookDetail.callback(hookDetail.hookedCommand, this);
          });
        });
        return result;
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {Command} subCommand
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallSubCommandHook(promise, subCommand, event) {
        let result = promise;
        if (this._lifeCycleHooks[event] !== void 0) {
          this._lifeCycleHooks[event].forEach((hook) => {
            result = this._chainOrCall(result, () => {
              return hook(this, subCommand);
            });
          });
        }
        return result;
      }
      /**
       * Process arguments in context of this command.
       * Returns action result, in case it is a promise.
       *
       * @private
       */
      _parseCommand(operands, unknown) {
        const parsed = this.parseOptions(unknown);
        this._parseOptionsEnv();
        this._parseOptionsImplied();
        operands = operands.concat(parsed.operands);
        unknown = parsed.unknown;
        this.args = operands.concat(unknown);
        if (operands && this._findCommand(operands[0])) {
          return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
        }
        if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
          return this._dispatchHelpCommand(operands[1]);
        }
        if (this._defaultCommandName) {
          this._outputHelpIfRequested(unknown);
          return this._dispatchSubcommand(
            this._defaultCommandName,
            operands,
            unknown
          );
        }
        if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
          this.help({ error: true });
        }
        this._outputHelpIfRequested(parsed.unknown);
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        const checkForUnknownOptions = () => {
          if (parsed.unknown.length > 0) {
            this.unknownOption(parsed.unknown[0]);
          }
        };
        const commandEvent = `command:${this.name()}`;
        if (this._actionHandler) {
          checkForUnknownOptions();
          this._processArguments();
          let promiseChain;
          promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
          promiseChain = this._chainOrCall(
            promiseChain,
            () => this._actionHandler(this.processedArgs)
          );
          if (this.parent) {
            promiseChain = this._chainOrCall(promiseChain, () => {
              this.parent.emit(commandEvent, operands, unknown);
            });
          }
          promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
          return promiseChain;
        }
        if (this.parent && this.parent.listenerCount(commandEvent)) {
          checkForUnknownOptions();
          this._processArguments();
          this.parent.emit(commandEvent, operands, unknown);
        } else if (operands.length) {
          if (this._findCommand("*")) {
            return this._dispatchSubcommand("*", operands, unknown);
          }
          if (this.listenerCount("command:*")) {
            this.emit("command:*", operands, unknown);
          } else if (this.commands.length) {
            this.unknownCommand();
          } else {
            checkForUnknownOptions();
            this._processArguments();
          }
        } else if (this.commands.length) {
          checkForUnknownOptions();
          this.help({ error: true });
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      }
      /**
       * Find matching command.
       *
       * @private
       * @return {Command | undefined}
       */
      _findCommand(name) {
        if (!name) return void 0;
        return this.commands.find(
          (cmd) => cmd._name === name || cmd._aliases.includes(name)
        );
      }
      /**
       * Return an option matching `arg` if any.
       *
       * @param {string} arg
       * @return {Option}
       * @package
       */
      _findOption(arg) {
        return this.options.find((option) => option.is(arg));
      }
      /**
       * Display an error message if a mandatory option does not have a value.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForMissingMandatoryOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd.options.forEach((anOption) => {
            if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) {
              cmd.missingMandatoryOptionValue(anOption);
            }
          });
        });
      }
      /**
       * Display an error message if conflicting options are used together in this.
       *
       * @private
       */
      _checkForConflictingLocalOptions() {
        const definedNonDefaultOptions = this.options.filter((option) => {
          const optionKey = option.attributeName();
          if (this.getOptionValue(optionKey) === void 0) {
            return false;
          }
          return this.getOptionValueSource(optionKey) !== "default";
        });
        const optionsWithConflicting = definedNonDefaultOptions.filter(
          (option) => option.conflictsWith.length > 0
        );
        optionsWithConflicting.forEach((option) => {
          const conflictingAndDefined = definedNonDefaultOptions.find(
            (defined) => option.conflictsWith.includes(defined.attributeName())
          );
          if (conflictingAndDefined) {
            this._conflictingOption(option, conflictingAndDefined);
          }
        });
      }
      /**
       * Display an error message if conflicting options are used together.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForConflictingOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd._checkForConflictingLocalOptions();
        });
      }
      /**
       * Parse options from `argv` removing known options,
       * and return argv split into operands and unknown arguments.
       *
       * Examples:
       *
       *     argv => operands, unknown
       *     --known kkk op => [op], []
       *     op --known kkk => [op], []
       *     sub --unknown uuu op => [sub], [--unknown uuu op]
       *     sub -- --unknown uuu op => [sub --unknown uuu op], []
       *
       * @param {string[]} argv
       * @return {{operands: string[], unknown: string[]}}
       */
      parseOptions(argv) {
        const operands = [];
        const unknown = [];
        let dest = operands;
        const args = argv.slice();
        function maybeOption(arg) {
          return arg.length > 1 && arg[0] === "-";
        }
        let activeVariadicOption = null;
        while (args.length) {
          const arg = args.shift();
          if (arg === "--") {
            if (dest === unknown) dest.push(arg);
            dest.push(...args);
            break;
          }
          if (activeVariadicOption && !maybeOption(arg)) {
            this.emit(`option:${activeVariadicOption.name()}`, arg);
            continue;
          }
          activeVariadicOption = null;
          if (maybeOption(arg)) {
            const option = this._findOption(arg);
            if (option) {
              if (option.required) {
                const value = args.shift();
                if (value === void 0) this.optionMissingArgument(option);
                this.emit(`option:${option.name()}`, value);
              } else if (option.optional) {
                let value = null;
                if (args.length > 0 && !maybeOption(args[0])) {
                  value = args.shift();
                }
                this.emit(`option:${option.name()}`, value);
              } else {
                this.emit(`option:${option.name()}`);
              }
              activeVariadicOption = option.variadic ? option : null;
              continue;
            }
          }
          if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
            const option = this._findOption(`-${arg[1]}`);
            if (option) {
              if (option.required || option.optional && this._combineFlagAndOptionalValue) {
                this.emit(`option:${option.name()}`, arg.slice(2));
              } else {
                this.emit(`option:${option.name()}`);
                args.unshift(`-${arg.slice(2)}`);
              }
              continue;
            }
          }
          if (/^--[^=]+=/.test(arg)) {
            const index = arg.indexOf("=");
            const option = this._findOption(arg.slice(0, index));
            if (option && (option.required || option.optional)) {
              this.emit(`option:${option.name()}`, arg.slice(index + 1));
              continue;
            }
          }
          if (maybeOption(arg)) {
            dest = unknown;
          }
          if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
            if (this._findCommand(arg)) {
              operands.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
              operands.push(arg);
              if (args.length > 0) operands.push(...args);
              break;
            } else if (this._defaultCommandName) {
              unknown.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            }
          }
          if (this._passThroughOptions) {
            dest.push(arg);
            if (args.length > 0) dest.push(...args);
            break;
          }
          dest.push(arg);
        }
        return { operands, unknown };
      }
      /**
       * Return an object containing local option values as key-value pairs.
       *
       * @return {object}
       */
      opts() {
        if (this._storeOptionsAsProperties) {
          const result = {};
          const len = this.options.length;
          for (let i = 0; i < len; i++) {
            const key = this.options[i].attributeName();
            result[key] = key === this._versionOptionName ? this._version : this[key];
          }
          return result;
        }
        return this._optionValues;
      }
      /**
       * Return an object containing merged local and global option values as key-value pairs.
       *
       * @return {object}
       */
      optsWithGlobals() {
        return this._getCommandAndAncestors().reduce(
          (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
          {}
        );
      }
      /**
       * Display error message and exit (or call exitOverride).
       *
       * @param {string} message
       * @param {object} [errorOptions]
       * @param {string} [errorOptions.code] - an id string representing the error
       * @param {number} [errorOptions.exitCode] - used with process.exit
       */
      error(message, errorOptions) {
        this._outputConfiguration.outputError(
          `${message}
`,
          this._outputConfiguration.writeErr
        );
        if (typeof this._showHelpAfterError === "string") {
          this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
        } else if (this._showHelpAfterError) {
          this._outputConfiguration.writeErr("\n");
          this.outputHelp({ error: true });
        }
        const config = errorOptions || {};
        const exitCode = config.exitCode || 1;
        const code = config.code || "commander.error";
        this._exit(exitCode, code, message);
      }
      /**
       * Apply any option related environment variables, if option does
       * not have a value from cli or client code.
       *
       * @private
       */
      _parseOptionsEnv() {
        this.options.forEach((option) => {
          if (option.envVar && option.envVar in process2.env) {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === void 0 || ["default", "config", "env"].includes(
              this.getOptionValueSource(optionKey)
            )) {
              if (option.required || option.optional) {
                this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
              } else {
                this.emit(`optionEnv:${option.name()}`);
              }
            }
          }
        });
      }
      /**
       * Apply any implied option values, if option is undefined or default value.
       *
       * @private
       */
      _parseOptionsImplied() {
        const dualHelper = new DualOptions(this.options);
        const hasCustomOptionValue = (optionKey) => {
          return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
        };
        this.options.filter(
          (option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(
            this.getOptionValue(option.attributeName()),
            option
          )
        ).forEach((option) => {
          Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
            this.setOptionValueWithSource(
              impliedKey,
              option.implied[impliedKey],
              "implied"
            );
          });
        });
      }
      /**
       * Argument `name` is missing.
       *
       * @param {string} name
       * @private
       */
      missingArgument(name) {
        const message = `error: missing required argument '${name}'`;
        this.error(message, { code: "commander.missingArgument" });
      }
      /**
       * `Option` is missing an argument.
       *
       * @param {Option} option
       * @private
       */
      optionMissingArgument(option) {
        const message = `error: option '${option.flags}' argument missing`;
        this.error(message, { code: "commander.optionMissingArgument" });
      }
      /**
       * `Option` does not have a value, and is a mandatory option.
       *
       * @param {Option} option
       * @private
       */
      missingMandatoryOptionValue(option) {
        const message = `error: required option '${option.flags}' not specified`;
        this.error(message, { code: "commander.missingMandatoryOptionValue" });
      }
      /**
       * `Option` conflicts with another option.
       *
       * @param {Option} option
       * @param {Option} conflictingOption
       * @private
       */
      _conflictingOption(option, conflictingOption) {
        const findBestOptionFromValue = (option2) => {
          const optionKey = option2.attributeName();
          const optionValue = this.getOptionValue(optionKey);
          const negativeOption = this.options.find(
            (target) => target.negate && optionKey === target.attributeName()
          );
          const positiveOption = this.options.find(
            (target) => !target.negate && optionKey === target.attributeName()
          );
          if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) {
            return negativeOption;
          }
          return positiveOption || option2;
        };
        const getErrorMessage = (option2) => {
          const bestOption = findBestOptionFromValue(option2);
          const optionKey = bestOption.attributeName();
          const source = this.getOptionValueSource(optionKey);
          if (source === "env") {
            return `environment variable '${bestOption.envVar}'`;
          }
          return `option '${bestOption.flags}'`;
        };
        const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
        this.error(message, { code: "commander.conflictingOption" });
      }
      /**
       * Unknown option `flag`.
       *
       * @param {string} flag
       * @private
       */
      unknownOption(flag) {
        if (this._allowUnknownOption) return;
        let suggestion = "";
        if (flag.startsWith("--") && this._showSuggestionAfterError) {
          let candidateFlags = [];
          let command = this;
          do {
            const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
            candidateFlags = candidateFlags.concat(moreFlags);
            command = command.parent;
          } while (command && !command._enablePositionalOptions);
          suggestion = suggestSimilar(flag, candidateFlags);
        }
        const message = `error: unknown option '${flag}'${suggestion}`;
        this.error(message, { code: "commander.unknownOption" });
      }
      /**
       * Excess arguments, more than expected.
       *
       * @param {string[]} receivedArgs
       * @private
       */
      _excessArguments(receivedArgs) {
        if (this._allowExcessArguments) return;
        const expected = this.registeredArguments.length;
        const s = expected === 1 ? "" : "s";
        const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
        const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
        this.error(message, { code: "commander.excessArguments" });
      }
      /**
       * Unknown command.
       *
       * @private
       */
      unknownCommand() {
        const unknownName = this.args[0];
        let suggestion = "";
        if (this._showSuggestionAfterError) {
          const candidateNames = [];
          this.createHelp().visibleCommands(this).forEach((command) => {
            candidateNames.push(command.name());
            if (command.alias()) candidateNames.push(command.alias());
          });
          suggestion = suggestSimilar(unknownName, candidateNames);
        }
        const message = `error: unknown command '${unknownName}'${suggestion}`;
        this.error(message, { code: "commander.unknownCommand" });
      }
      /**
       * Get or set the program version.
       *
       * This method auto-registers the "-V, --version" option which will print the version number.
       *
       * You can optionally supply the flags and description to override the defaults.
       *
       * @param {string} [str]
       * @param {string} [flags]
       * @param {string} [description]
       * @return {(this | string | undefined)} `this` command for chaining, or version string if no arguments
       */
      version(str, flags, description) {
        if (str === void 0) return this._version;
        this._version = str;
        flags = flags || "-V, --version";
        description = description || "output the version number";
        const versionOption = this.createOption(flags, description);
        this._versionOptionName = versionOption.attributeName();
        this._registerOption(versionOption);
        this.on("option:" + versionOption.name(), () => {
          this._outputConfiguration.writeOut(`${str}
`);
          this._exit(0, "commander.version", str);
        });
        return this;
      }
      /**
       * Set the description.
       *
       * @param {string} [str]
       * @param {object} [argsDescription]
       * @return {(string|Command)}
       */
      description(str, argsDescription) {
        if (str === void 0 && argsDescription === void 0)
          return this._description;
        this._description = str;
        if (argsDescription) {
          this._argsDescription = argsDescription;
        }
        return this;
      }
      /**
       * Set the summary. Used when listed as subcommand of parent.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      summary(str) {
        if (str === void 0) return this._summary;
        this._summary = str;
        return this;
      }
      /**
       * Set an alias for the command.
       *
       * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
       *
       * @param {string} [alias]
       * @return {(string|Command)}
       */
      alias(alias) {
        if (alias === void 0) return this._aliases[0];
        let command = this;
        if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
          command = this.commands[this.commands.length - 1];
        }
        if (alias === command._name)
          throw new Error("Command alias can't be the same as its name");
        const matchingCommand = this.parent?._findCommand(alias);
        if (matchingCommand) {
          const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
          throw new Error(
            `cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`
          );
        }
        command._aliases.push(alias);
        return this;
      }
      /**
       * Set aliases for the command.
       *
       * Only the first alias is shown in the auto-generated help.
       *
       * @param {string[]} [aliases]
       * @return {(string[]|Command)}
       */
      aliases(aliases) {
        if (aliases === void 0) return this._aliases;
        aliases.forEach((alias) => this.alias(alias));
        return this;
      }
      /**
       * Set / get the command usage `str`.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      usage(str) {
        if (str === void 0) {
          if (this._usage) return this._usage;
          const args = this.registeredArguments.map((arg) => {
            return humanReadableArgName(arg);
          });
          return [].concat(
            this.options.length || this._helpOption !== null ? "[options]" : [],
            this.commands.length ? "[command]" : [],
            this.registeredArguments.length ? args : []
          ).join(" ");
        }
        this._usage = str;
        return this;
      }
      /**
       * Get or set the name of the command.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      name(str) {
        if (str === void 0) return this._name;
        this._name = str;
        return this;
      }
      /**
       * Set the name of the command from script filename, such as process.argv[1],
       * or require.main.filename, or __filename.
       *
       * (Used internally and public although not documented in README.)
       *
       * @example
       * program.nameFromFilename(require.main.filename);
       *
       * @param {string} filename
       * @return {Command}
       */
      nameFromFilename(filename) {
        this._name = path.basename(filename, path.extname(filename));
        return this;
      }
      /**
       * Get or set the directory for searching for executable subcommands of this command.
       *
       * @example
       * program.executableDir(__dirname);
       * // or
       * program.executableDir('subcommands');
       *
       * @param {string} [path]
       * @return {(string|null|Command)}
       */
      executableDir(path2) {
        if (path2 === void 0) return this._executableDir;
        this._executableDir = path2;
        return this;
      }
      /**
       * Return program help documentation.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
       * @return {string}
       */
      helpInformation(contextOptions) {
        const helper = this.createHelp();
        if (helper.helpWidth === void 0) {
          helper.helpWidth = contextOptions && contextOptions.error ? this._outputConfiguration.getErrHelpWidth() : this._outputConfiguration.getOutHelpWidth();
        }
        return helper.formatHelp(this, helper);
      }
      /**
       * @private
       */
      _getHelpContext(contextOptions) {
        contextOptions = contextOptions || {};
        const context = { error: !!contextOptions.error };
        let write2;
        if (context.error) {
          write2 = (arg) => this._outputConfiguration.writeErr(arg);
        } else {
          write2 = (arg) => this._outputConfiguration.writeOut(arg);
        }
        context.write = contextOptions.write || write2;
        context.command = this;
        return context;
      }
      /**
       * Output help information for this command.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      outputHelp(contextOptions) {
        let deprecatedCallback;
        if (typeof contextOptions === "function") {
          deprecatedCallback = contextOptions;
          contextOptions = void 0;
        }
        const context = this._getHelpContext(contextOptions);
        this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", context));
        this.emit("beforeHelp", context);
        let helpInformation = this.helpInformation(context);
        if (deprecatedCallback) {
          helpInformation = deprecatedCallback(helpInformation);
          if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
            throw new Error("outputHelp callback must return a string or a Buffer");
          }
        }
        context.write(helpInformation);
        if (this._getHelpOption()?.long) {
          this.emit(this._getHelpOption().long);
        }
        this.emit("afterHelp", context);
        this._getCommandAndAncestors().forEach(
          (command) => command.emit("afterAllHelp", context)
        );
      }
      /**
       * You can pass in flags and a description to customise the built-in help option.
       * Pass in false to disable the built-in help option.
       *
       * @example
       * program.helpOption('-?, --help' 'show help'); // customise
       * program.helpOption(false); // disable
       *
       * @param {(string | boolean)} flags
       * @param {string} [description]
       * @return {Command} `this` command for chaining
       */
      helpOption(flags, description) {
        if (typeof flags === "boolean") {
          if (flags) {
            this._helpOption = this._helpOption ?? void 0;
          } else {
            this._helpOption = null;
          }
          return this;
        }
        flags = flags ?? "-h, --help";
        description = description ?? "display help for command";
        this._helpOption = this.createOption(flags, description);
        return this;
      }
      /**
       * Lazy create help option.
       * Returns null if has been disabled with .helpOption(false).
       *
       * @returns {(Option | null)} the help option
       * @package
       */
      _getHelpOption() {
        if (this._helpOption === void 0) {
          this.helpOption(void 0, void 0);
        }
        return this._helpOption;
      }
      /**
       * Supply your own option to use for the built-in help option.
       * This is an alternative to using helpOption() to customise the flags and description etc.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addHelpOption(option) {
        this._helpOption = option;
        return this;
      }
      /**
       * Output help information and exit.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      help(contextOptions) {
        this.outputHelp(contextOptions);
        let exitCode = process2.exitCode || 0;
        if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
          exitCode = 1;
        }
        this._exit(exitCode, "commander.help", "(outputHelp)");
      }
      /**
       * Add additional text to be displayed with the built-in help.
       *
       * Position is 'before' or 'after' to affect just this command,
       * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
       *
       * @param {string} position - before or after built-in help
       * @param {(string | Function)} text - string to add, or a function returning a string
       * @return {Command} `this` command for chaining
       */
      addHelpText(position, text) {
        const allowedValues = ["beforeAll", "before", "after", "afterAll"];
        if (!allowedValues.includes(position)) {
          throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        const helpEvent = `${position}Help`;
        this.on(helpEvent, (context) => {
          let helpStr;
          if (typeof text === "function") {
            helpStr = text({ error: context.error, command: context.command });
          } else {
            helpStr = text;
          }
          if (helpStr) {
            context.write(`${helpStr}
`);
          }
        });
        return this;
      }
      /**
       * Output help information if help flags specified
       *
       * @param {Array} args - array of options to search for help flags
       * @private
       */
      _outputHelpIfRequested(args) {
        const helpOption = this._getHelpOption();
        const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
        if (helpRequested) {
          this.outputHelp();
          this._exit(0, "commander.helpDisplayed", "(outputHelp)");
        }
      }
    };
    function incrementNodeInspectorPort(args) {
      return args.map((arg) => {
        if (!arg.startsWith("--inspect")) {
          return arg;
        }
        let debugOption;
        let debugHost = "127.0.0.1";
        let debugPort = "9229";
        let match;
        if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
          debugOption = match[1];
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
          debugOption = match[1];
          if (/^\d+$/.test(match[3])) {
            debugPort = match[3];
          } else {
            debugHost = match[3];
          }
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
          debugOption = match[1];
          debugHost = match[3];
          debugPort = match[4];
        }
        if (debugOption && debugPort !== "0") {
          return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
        }
        return arg;
      });
    }
    exports.Command = Command2;
  }
});

// node_modules/commander/index.js
var require_commander = __commonJS({
  "node_modules/commander/index.js"(exports) {
    var { Argument: Argument2 } = require_argument();
    var { Command: Command2 } = require_command();
    var { CommanderError: CommanderError2, InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2 } = require_option();
    exports.program = new Command2();
    exports.createCommand = (name) => new Command2(name);
    exports.createOption = (flags, description) => new Option2(flags, description);
    exports.createArgument = (name, description) => new Argument2(name, description);
    exports.Command = Command2;
    exports.Option = Option2;
    exports.Argument = Argument2;
    exports.Help = Help2;
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
    exports.InvalidOptionArgumentError = InvalidArgumentError2;
  }
});

// floe-cli/dist/cli.js
import { existsSync as existsSync5, readFileSync as readFileSync5 } from "node:fs";
import { dirname as dirname2, join as join5, resolve as resolve4 } from "node:path";
import { createInterface as createInterface3 } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { spawn as spawn2 } from "node:child_process";

// node_modules/commander/esm.mjs
var import_index = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  // deprecated old name
  Command,
  Argument,
  Option,
  Help
} = import_index.default;

// floe-cli/dist/reset.js
import { existsSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
function buildResetPlan(configPath, config, options = {}) {
  const r = (p) => resolveLocalPath(configPath, config.home, p);
  const identityDir = join(r("."), "identity");
  const wipeTargets = [
    { path: r(config.bus.data_dir), label: "bus data (workspaces, contexts, agents)" },
    { path: r(config.bus.log_dir), label: "bus logs" },
    { path: r(config.bridge.data_dir), label: "bridge data" },
    { path: r(config.bridge.log_dir), label: "bridge logs" },
    { path: r(config.library.configs_dir), label: "library: configs" },
    { path: r(config.library.skills_dir), label: "library: skills" },
    { path: r(config.library.extensions_dir), label: "library: extensions" },
    { path: r(config.library.mcp_dir), label: "library: mcp" },
    { path: r(config.library.templates_dir), label: "library: templates" },
    { path: recordsPath(configPath, config), label: "service process records (services.json)" },
    { path: r("./logs/identity"), label: "identity agent logs" },
    { path: r("./run"), label: "identity agent run file" },
    { path: r("./runtime"), label: "staged service files (runtime/)" },
    ...options.includeIdentity ? [{ path: identityDir, label: "identity/ (your identity; only its recovery phrase can bring it back)" }] : []
  ];
  const seen = /* @__PURE__ */ new Set();
  const wipe = [];
  for (const target of wipeTargets) {
    if (!seen.has(target.path)) {
      seen.add(target.path);
      wipe.push(target);
    }
  }
  const authDir = join(r("."), "auth");
  const preserve = [
    { path: configPath, label: "config.yaml (service settings)" },
    { path: authDir, label: "auth/ (provider credentials)" },
    ...options.includeIdentity ? [] : [{ path: identityDir, label: "identity/ (your identity)" }]
  ];
  return { wipe, preserve };
}
function executeReset(configPath, config, options = {}) {
  const { wipe } = buildResetPlan(configPath, config, options);
  for (const target of wipe) {
    if (!existsSync(target.path))
      continue;
    const stat = statSync(target.path);
    rmSync(target.path, { recursive: stat.isDirectory(), force: true });
  }
  ensureLocalDirs(configPath, config);
}

// floe-cli/dist/operations-command.js
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
function registerOperationsCommand(program3, dependencies) {
  const operations = program3.command("operations").description("Discover and use Floe's canonical semantic operations");
  addCommonOptions(operations.command("list").description("List operations allowed by the current Floe authority")).option("--query <text>", "find operations by outcome or name").option("--category <category>", "limit operations to one Bus category").option("--json", "print the exact Bus descriptor projection").action(async (options) => {
    const client = createClient(dependencies);
    const boundary = await resolveBoundary(client, options, dependencies);
    const target = parseTarget(options);
    const descriptors = await client.discover({
      boundary,
      query: options.query,
      category: options.category,
      target
    });
    write(dependencies, options.json ? JSON.stringify({ operations: descriptors }, null, 2) : formatOperationList(descriptors));
  });
  addCommonOptions(operations.command("describe").argument("<operation-id>", "exact semantic operation id").description("Show one live Bus-owned operation contract")).action(async (operationId, options) => {
    const client = createClient(dependencies);
    const boundary = await resolveBoundary(client, options, dependencies);
    const descriptor = await client.describe(boundary, operationId, parseTarget(options));
    write(dependencies, JSON.stringify(descriptor, null, 2));
  });
  addCommonOptions(operations.command("invoke").argument("<operation-id>", "exact semantic operation id").description("Invoke one discovered operation using JSON intent")).requiredOption("--input <json-or-@file>", "JSON operation intent, or @path to a JSON file").option("--idempotency-key <key>", "stable key so a retry of a write is safe to replay; reads do not need one").option("--expected-revision <revision>", "expected target revision for compare-and-swap").action(async (operationId, options) => {
    const client = createClient(dependencies);
    const boundary = await resolveBoundary(client, options, dependencies);
    const result = await client.invokeSelected({
      boundary,
      operation_id: operationId,
      input: parseJsonIntent(options.input, dependencies.read_file),
      ...options.idempotencyKey !== void 0 ? { idempotency_key: options.idempotencyKey } : {},
      target: parseTarget(options),
      ...options.expectedRevision !== void 0 ? { expected_resource_revision: options.expectedRevision } : {},
      confirm: dependencies.confirm ?? confirmInTerminal
    });
    write(dependencies, JSON.stringify(result, null, 2));
  });
}
function addCommonOptions(command) {
  return command.option("--workspace <workspace-id>", "use an exact attached Workspace identity").option("--host", "use local host authority instead of a Workspace").option("--target-kind <kind>", "target resource kind from the discovered contract").option("--target-id <id>", "target resource identity from the discovered contract");
}
async function resolveBoundary(client, options, dependencies) {
  if (options.host) {
    if (options.workspace)
      throw new Error("Use either --host or --workspace, not both.");
    return { kind: "host" };
  }
  const workspaces = await client.listLocalWorkspaces();
  const workspace = selectLocalWorkspace(workspaces, options.workspace, dependencies.cwd?.() ?? process.cwd());
  return { kind: "workspace", workspace_id: workspace.workspace_id };
}
function parseTarget(options) {
  if (Boolean(options.targetKind) !== Boolean(options.targetId)) {
    throw new Error("--target-kind and --target-id must be supplied together.");
  }
  return options.targetKind && options.targetId ? { kind: options.targetKind, id: options.targetId } : null;
}
function parseJsonIntent(value, readFile = (path) => readFileSync(path, "utf8")) {
  const source = value.startsWith("@") ? readFile(value.slice(1)) : value;
  if (!source.trim())
    throw new Error("Operation input must contain JSON intent.");
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Operation input is not valid JSON: ${error.message}`);
  }
}
function formatOperationList(descriptors) {
  if (descriptors.length === 0)
    return "No matching semantic operations are available.";
  return descriptors.map((descriptor) => {
    const effect = typeof descriptor.effects.mode === "string" ? descriptor.effects.mode : "unknown";
    const availability = descriptor.availability.available ? "available" : refusalMessage(descriptor.availability.refusal);
    return `${descriptor.operation_id} | ${descriptor.category} | ${effect} | ${availability}
  ${descriptor.title}`;
  }).join("\n");
}
async function confirmInTerminal(confirmation) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    stdout.write(`
${confirmation.title}
${confirmation.description}
`);
    const answer = (await rl.question("Continue? [y/N] ")).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
function createClient(dependencies) {
  return dependencies.client();
}
function write(dependencies, message) {
  (dependencies.output ?? console.log)(message);
}
function refusalMessage(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const message = value.message;
    if (typeof message === "string" && message)
      return `unavailable: ${message}`;
  }
  return "unavailable";
}

// floe-cli/dist/identity-command.js
import { isAbsolute, relative, resolve as resolve2 } from "node:path";

// floe-cli/dist/identity/terminal-commands.js
import { createInterface as createInterface2 } from "node:readline";
import { resolve } from "node:path";
var SURFACE = "floe terminal";
var PHRASE_WARNING = "Write these words down and keep them somewhere safe. They are the only way\nto get this identity back if you forget the passphrase or lose this machine.\nFloe will show them again with `floe identity reveal`.";
function registerPersonIdentityCommands(identity, configPath) {
  const run = (action) => async () => {
    const prompt = new Prompter();
    let client = null;
    try {
      client = await connectIdentity({ surface: SURFACE, configPath: configPath() });
      if (client.versionNote)
        console.log(`Note: ${client.versionNote}`);
      await action(client, prompt);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    } finally {
      prompt.close();
      client?.close();
    }
  };
  identity.command("status").description("Show your identity and whether it is unlocked").action(run(async (client) => {
    printState(client.state);
    const { sessions } = await client.sessions();
    if (sessions.length)
      console.log(`${sessions.length} surface session(s) are using it (floe identity sessions).`);
  }));
  identity.command("create").description("Create your identity on this machine").requiredOption("--name <name>", "the name others see for you").action((options) => run(async (client, prompt) => {
    if (client.state.kind !== "none")
      throw new Error("You already have an identity on this machine. See `floe identity status`.");
    const passphrase = await prompt.newPassphrase();
    const result = await client.create({ display_name: options.name, passphrase });
    console.log(`
Created ${options.name}  ${result.npub}`);
    console.log(passphrase ? "Protected by your passphrase." : "Protected by this device: it unlocks without a passphrase for this user on this machine.");
    showPhrase(result.phrase);
  })());
  identity.command("unlock").description("Unlock your identity so surfaces can act as you").action(run(async (client, prompt) => {
    const state = requireIdentity(client.state);
    const passphrase = state.protection === "passphrase" ? await prompt.hidden("Passphrase: ") : "";
    printState(await client.unlock(passphrase));
  }));
  identity.command("lock").description("Lock your identity: Floe forgets the key and every surface session ends").action(run(async (client) => {
    requireIdentity(client.state);
    printState(await client.lock());
  }));
  identity.command("reveal").description("Show the backup of your identity (its recovery phrase)").action(run(async (client, prompt) => {
    const state = requireIdentity(client.state);
    const result = state.protection === "passphrase" ? await client.reveal({ passphrase: await prompt.hidden("Passphrase: ") }) : await (async () => {
      if (!await prompt.yes("Anyone who sees what follows can become you. Show it now? [y/N] "))
        throw new Error("Not shown.");
      return client.reveal({ confirm: true });
    })();
    if (result.secret_kind === "phrase") {
      showPhrase(result.secret);
    } else {
      console.log("\nThis identity was made before recovery phrases existed, so it has no words.");
      console.log("Its backup is this key. Keep it as safe as a phrase:");
      console.log(`
  ${result.secret}
`);
    }
  }));
  identity.command("restore").description("Restore your identity from its recovery phrase (also: forgot passphrase, still have the words)").option("--name <name>", "the name others see for you (defaults to the name Floe already knows)").option("--replace", "replace a different identity already on this machine (it is set aside, not deleted)").action((options) => run(async (client, prompt) => {
    const phrase = await prompt.hidden("Recovery phrase: ");
    const passphrase = await prompt.newPassphrase();
    const result = await client.restore({
      phrase,
      passphrase,
      ...options.name ? { display_name: options.name } : {},
      ...options.replace ? { replace_existing: true } : {}
    });
    console.log(`
Restored ${result.npub}`);
    if (result.set_aside_as)
      console.log(`The previous identity file was kept as ${result.set_aside_as}.`);
    printState(client.state);
  })());
  identity.command("replace").description("Forgot the passphrase and have no recovery phrase: make a new identity that keeps your workspaces").option("--name <name>", "the name others see for you (defaults to your current one)").action((options) => run(async (client, prompt) => {
    requireIdentity(client.state);
    console.log("This makes a NEW identity. Floe admits it to every workspace your current one is in,");
    console.log("then revokes the current one here. The current identity file is kept under a dated");
    console.log("name, in case the passphrase turns up. Other machines will not recognise the new one.");
    if (!await prompt.yes("Continue? [y/N] "))
      throw new Error("Nothing was changed.");
    const passphrase = await prompt.newPassphrase();
    const result = await client.replace({ passphrase, ...options.name ? { display_name: options.name } : {} });
    console.log(`
New identity ${result.npub} (was ${result.previous_npub}).`);
    console.log(result.workspaces.length ? `Carried into: ${result.workspaces.map((workspace) => workspace.name).join(", ")}.` : "Your previous identity was not in any workspace here.");
    if (result.set_aside_as)
      console.log(`The previous identity file was kept as ${result.set_aside_as}.`);
    showPhrase(result.phrase);
  })());
  identity.command("join").argument("[folder]", "the folder to work in (defaults to the current directory)").option("--create", "create the folder if it does not exist").description("Create or join the workspace for a folder, as you").action((folder, options) => run(async (client) => {
    requireIdentity(client.state);
    const locator = resolve(folder ?? process.cwd());
    const outcome = await client.joinFolder({ locator, create_directory: options.create === true });
    if (outcome.kind === "ready")
      console.log(`You are in the workspace for ${locator} (${outcome.workspace_id}).`);
    else if (outcome.kind === "pending")
      console.log(`The workspace for ${locator} is being prepared (${outcome.workspace_id}).`);
    else if (outcome.kind === "failed")
      throw new Error(`The workspace for ${locator} could not be prepared (${outcome.reason}).`);
    else
      throw new Error("message" in outcome ? outcome.message : "The folder could not be joined.");
  })());
  identity.command("sessions").description("Show which surfaces are acting as you").option("--revoke <session_id>", "end one surface's session and revoke its bearer").action((options) => run(async (client) => {
    if (options.revoke) {
      await client.revokeSession(options.revoke);
      console.log(`Ended session ${options.revoke}; its bearer no longer works.`);
      return;
    }
    const { sessions } = await client.sessions();
    if (!sessions.length) {
      console.log("No surface is acting as you right now.");
      return;
    }
    for (const session of sessions) {
      const where = session.workspace ? ` in ${session.workspace.name}` : "";
      const until = session.expires_at ? `, bearer until ${session.expires_at}` : "";
      console.log(`${session.session_id}  ${session.surface}  ${session.status}${where}${until}`);
    }
  })());
}
function requireIdentity(state) {
  if (state.kind === "none")
    throw new Error("There is no identity on this machine yet. Create one with `floe identity create --name <name>`.");
  return state;
}
function printState(state) {
  if (state.kind === "none") {
    console.log("No identity on this machine yet. Create one with `floe identity create --name <name>`.");
    return;
  }
  console.log(`${state.display_name}  ${state.npub}`);
  const guard = state.protection === "passphrase" ? "passphrase" : "this device";
  console.log(`${state.kind === "unlocked" ? "Unlocked" : "Locked"} (protected by ${guard}).`);
  if (state.secret_kind === "nsec")
    console.log("This identity has no recovery phrase; `floe identity reveal` shows its key instead.");
}
function showPhrase(phrase) {
  const words = phrase.split(" ");
  console.log("\nRecovery phrase:\n");
  for (let row = 0; row < words.length; row += 6) {
    console.log("  " + words.slice(row, row + 6).map((word, index) => `${String(row + index + 1).padStart(2)}. ${word.padEnd(9)}`).join(" "));
  }
  console.log(`
${PHRASE_WARNING}`);
}
var Prompter = class {
  rl = null;
  muted = false;
  queued = [];
  waiting = [];
  open() {
    if (this.rl)
      return this.rl;
    const rl = createInterface2({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
    const write2 = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (text) => {
      if (!this.muted)
        write2(text);
    };
    rl.on("line", (line) => {
      const next = this.waiting.shift();
      if (next)
        next(line);
      else
        this.queued.push(line);
    });
    rl.on("close", () => {
      for (const next of this.waiting.splice(0))
        next("");
    });
    this.rl = rl;
    return rl;
  }
  ask(question, muted) {
    const rl = this.open();
    process.stdout.write(question);
    this.muted = muted;
    return new Promise((resolveLine) => {
      const take = (line) => {
        this.muted = false;
        if (muted)
          process.stdout.write("\n");
        resolveLine(line);
      };
      const queued = this.queued.shift();
      if (queued !== void 0)
        take(queued);
      else
        this.waiting.push(take);
      rl.resume();
    });
  }
  hidden(question) {
    return this.ask(question, true);
  }
  async yes(question) {
    return /^y(es)?$/i.test((await this.ask(question, false)).trim());
  }
  /** Ask for a new passphrase twice. Blank means: protect with this device. */
  async newPassphrase() {
    for (; ; ) {
      const first = await this.hidden("New passphrase (leave blank to protect with this device instead): ");
      if (!first)
        return "";
      const second = await this.hidden("Repeat the passphrase: ");
      if (first === second)
        return first;
      console.log("Those did not match. Try again.");
    }
  }
  close() {
    this.rl?.close();
    this.rl = null;
  }
};

// floe-cli/dist/identity-command.js
function registerIdentityCommand(program3, dependencies = {}) {
  const write2 = dependencies.output ?? ((message) => console.log(message));
  const resolveConfig = dependencies.resolve_config ?? (() => ensureConfig(program3.opts().config));
  const hostControlToken = dependencies.fetch_host_control_token ?? fetchHostControlToken;
  const httpFetch = dependencies.fetch ?? globalThis.fetch;
  const currentDir = dependencies.cwd ?? (() => process.cwd());
  const identity = program3.command("identity").description("Your identity on this machine, and the identities admitted to its workspaces");
  registerPersonIdentityCommands(identity, () => program3.opts().config);
  identity.command("add").description("Admit a public key to a workspace under a display name (requires host control)").requiredOption("--name <name>", "the human display name for this identity").requiredOption("--pubkey <npub|hex>", "the identity public key, as npub or 64-char hex").option("--workspace <workspace_id>", "the workspace this identity may act in; defaults to the workspace for the current directory").action(async (options) => {
    const { config } = resolveConfig();
    const token = await hostControlToken(busBase(config));
    const workspaceId = options.workspace ?? await resolveWorkspaceForCwd(busBase(config), token, httpFetch, currentDir(), write2);
    const response = await httpFetch(`${busBase(config)}/v1/identities`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ display_name: options.name, pubkey: options.pubkey, workspace_id: workspaceId })
    });
    if (!response.ok) {
      throw new Error(`Admission failed (${response.status}): ${await safeBody(response)}`);
    }
    const body = await response.json();
    write2(`Admitted "${body.identity.display_name}" as ${body.identity.identity_id}`);
    write2(`  ${body.identity.npub}`);
    write2(`  workspaces: ${body.workspaces.map((w) => `${w.name} (${w.workspace_id})`).join(", ") || "none"}`);
    write2("");
    write2("Re-admitting a lost key is re-admission, not recovery: a lost recovery phrase is unrecoverable.");
  });
  identity.command("list").description("List admitted identities and their live sessions (requires host control)").option("--json", "print the raw Bus response").action(async (options) => {
    const { config } = resolveConfig();
    const token = await hostControlToken(busBase(config));
    const response = await httpFetch(`${busBase(config)}/v1/clients`, {
      headers: { authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      throw new Error(`List failed (${response.status}): ${await safeBody(response)}`);
    }
    const body = await response.json();
    if (options.json) {
      write2(JSON.stringify(body, null, 2));
      return;
    }
    if (body.clients.length === 0) {
      write2("No identities admitted.");
      return;
    }
    for (const client of body.clients) {
      const state = client.revoked_at ? "revoked" : `${client.sessions.length} live session(s)`;
      write2(`${client.identity_id}  ${client.display_name}  [${state}]`);
      write2(`  ${client.npub}`);
      write2(`  workspaces: ${client.workspaces.map((w) => `${w.name} (${w.workspace_id})`).join(", ") || "none"}`);
    }
  });
  identity.command("revoke").description("Revoke an identity: kills its live bearers and blocks re-authentication (requires host control)").argument("<identity_id>", "the identity_id to revoke (from `floe identity list`)").action(async (identityId) => {
    const { config } = resolveConfig();
    const token = await hostControlToken(busBase(config));
    const response = await httpFetch(`${busBase(config)}/v1/clients/${encodeURIComponent(identityId)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      throw new Error(`Revoke failed (${response.status}): ${await safeBody(response)}`);
    }
    write2(`Revoked ${identityId}. Its live bearers are dead and it can no longer authenticate.`);
  });
}
function busBase(config) {
  return config.bus.http_base_url.replace(/\/+$/, "");
}
async function resolveWorkspaceForCwd(base, token, httpFetch, cwd, write2) {
  const response = await httpFetch(`${base}/v1/local/workspaces`, {
    headers: { authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new Error(`Could not list workspaces (${response.status}): ${await safeBody(response)}`);
  }
  const rows = (await response.json()).workspaces ?? [];
  const bound = rows.filter((row) => typeof row.locator === "string" && row.locator);
  const resolvedCwd = resolve2(cwd);
  const matches = bound.filter((row) => {
    const rel = relative(resolve2(row.locator), resolvedCwd);
    return rel === "" || !rel.startsWith("..") && !isAbsolute(rel);
  }).sort((left, right) => right.locator.length - left.locator.length);
  if (matches.length > 0) {
    const chosen = matches[0];
    write2(`Admitting into workspace "${chosen.name}" (${chosen.workspace_id}) for ${resolvedCwd}`);
    return chosen.workspace_id;
  }
  const lines = ["The current directory is not inside a registered workspace."];
  if (rows.length === 0) {
    lines.push("No workspaces are registered on this host yet. Run `floe setup` inside the workspace first.");
  } else {
    lines.push("Registered workspaces:");
    for (const row of rows) {
      lines.push(`  ${row.name} \u2014 ${row.workspace_id}${row.locator ? ` (${row.locator})` : " (unbound)"}`);
    }
    lines.push("Re-run from inside one of these directories, or pass --workspace <workspace_id>.");
  }
  throw new Error(lines.join("\n"));
}
async function safeBody(response) {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "<unreadable>";
  }
}

// floe-cli/dist/surfaces.js
var import_yaml = __toESM(require_dist(), 1);
import { spawn } from "node:child_process";
import { existsSync as existsSync2, mkdirSync, readdirSync, readFileSync as readFileSync2, rmSync as rmSync2, writeFileSync } from "node:fs";
import { basename, join as join2 } from "node:path";
var SURFACE_NAME = /^[a-z0-9][a-z0-9-]*$/;
var SurfaceEntrySchema = external_exports.object({
  name: external_exports.string().regex(SURFACE_NAME, "must be lowercase letters, digits and hyphens"),
  label: external_exports.string().min(1),
  launch: external_exports.object({
    command: external_exports.string().min(1),
    args: external_exports.array(external_exports.string()).default([])
  })
}).strict();
function surfacesDir(configPath, config) {
  return resolveLocalPath(configPath, config.home, "./surfaces");
}
function surfaceFile(configPath, config, name) {
  return join2(surfacesDir(configPath, config), `${name}.yaml`);
}
function listSurfaces(configPath, config) {
  const dir = surfacesDir(configPath, config);
  if (!existsSync2(dir))
    return { surfaces: [], broken: [] };
  const surfaces = [];
  const broken = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".yaml"))
      continue;
    const path = join2(dir, file);
    try {
      const parsed = SurfaceEntrySchema.parse(import_yaml.default.parse(readFileSync2(path, "utf8")));
      const expected = basename(file, ".yaml");
      if (parsed.name !== expected) {
        broken.push({ file, reason: `name '${parsed.name}' does not match filename '${expected}'` });
        continue;
      }
      surfaces.push(parsed);
    } catch (error) {
      broken.push({ file, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  surfaces.sort((a, b) => a.name.localeCompare(b.name));
  return { surfaces, broken };
}
function registerSurface(configPath, config, entry) {
  const validated = SurfaceEntrySchema.parse(entry);
  const dir = surfacesDir(configPath, config);
  mkdirSync(dir, { recursive: true });
  writeFileSync(surfaceFile(configPath, config, validated.name), import_yaml.default.stringify(validated), "utf8");
  return validated;
}
function removeSurface(configPath, config, name) {
  const path = surfaceFile(configPath, config, name);
  if (!existsSync2(path))
    return false;
  rmSync2(path);
  return true;
}
function launchSurface(entry) {
  return new Promise((resolve5, reject) => {
    const child = spawn(entry.launch.command, entry.launch.args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => resolve5(code ?? 0));
  });
}

// floe-cli/dist/surface-manifests.js
import { spawnSync } from "node:child_process";
import { existsSync as existsSync3, openSync, readdirSync as readdirSync2, readFileSync as readFileSync3, readSync, closeSync } from "node:fs";
import { extname, join as join3, resolve as resolve3 } from "node:path";
var ManifestSchema = external_exports.object({
  name: external_exports.string().regex(SURFACE_NAME, "must be lowercase letters, digits and hyphens"),
  label: external_exports.string().min(1),
  bin: external_exports.string().min(1)
}).strict();
function globalPackageRoot() {
  const result = spawnSync("npm root -g", {
    encoding: "utf8",
    shell: true,
    timeout: 15e3
  });
  const root = result.status === 0 ? result.stdout.trim() : "";
  return root && existsSync3(root) ? root : null;
}
function packageDirs(root) {
  const dirs = [];
  for (const entry of readdirSync2(root)) {
    if (entry.startsWith("."))
      continue;
    const path = join3(root, entry);
    if (entry.startsWith("@")) {
      try {
        for (const scoped of readdirSync2(path))
          dirs.push(join3(path, scoped));
      } catch {
      }
    } else {
      dirs.push(path);
    }
  }
  return dirs;
}
function detectPackageSurfaces(root) {
  const surfaces = [];
  const broken = [];
  if (!root)
    return { surfaces, broken };
  for (const dir of packageDirs(root)) {
    const manifestPath = join3(dir, "package.json");
    let pkg;
    try {
      pkg = JSON.parse(readFileSync3(manifestPath, "utf8"));
    } catch {
      continue;
    }
    const declared = pkg?.floe?.surface;
    if (declared === void 0)
      continue;
    const packageName = typeof pkg.name === "string" ? pkg.name : dir;
    const parsed = ManifestSchema.safeParse(declared);
    if (!parsed.success) {
      broken.push({ package: packageName, reason: parsed.error.issues.map((i) => `${i.path.join(".") || "surface"}: ${i.message}`).join("; ") });
      continue;
    }
    const binTarget = resolveBinTarget(pkg, parsed.data.bin);
    if (!binTarget) {
      broken.push({ package: packageName, reason: `floe.surface.bin '${parsed.data.bin}' is not one of this package's bins` });
      continue;
    }
    const script = resolve3(dir, binTarget);
    if (!existsSync3(script)) {
      broken.push({ package: packageName, reason: `bin '${parsed.data.bin}' points at ${binTarget}, which is not installed` });
      continue;
    }
    surfaces.push({
      name: parsed.data.name,
      label: parsed.data.label,
      launch: launchFor(script),
      package: packageName,
      packageDir: dir
    });
  }
  return { surfaces, broken };
}
function resolveBinTarget(pkg, binName) {
  if (typeof pkg.bin === "string") {
    const implied = String(pkg.name ?? "").replace(/^@[^/]+\//, "");
    return implied === binName ? pkg.bin : null;
  }
  if (pkg.bin && typeof pkg.bin === "object" && typeof pkg.bin[binName] === "string")
    return pkg.bin[binName];
  return null;
}
function launchFor(script) {
  if ([".js", ".mjs", ".cjs"].includes(extname(script).toLowerCase()) || hasNodeShebang(script)) {
    return { command: process.execPath, args: [script] };
  }
  return { command: script, args: [] };
}
function hasNodeShebang(path) {
  const buffer = Buffer.alloc(128);
  let fd;
  try {
    fd = openSync(path, "r");
    const read2 = readSync(fd, buffer, 0, buffer.length, 0);
    const firstLine = buffer.subarray(0, read2).toString("utf8").split(/\r?\n/)[0] ?? "";
    return firstLine.startsWith("#!") && firstLine.includes("node");
  } catch {
    return false;
  } finally {
    if (fd !== void 0)
      closeSync(fd);
  }
}

// floe-cli/dist/surface-catalog.js
function buildSurfaceCatalog(configPath, config, packageRoot = globalPackageRoot()) {
  const registry = listSurfaces(configPath, config);
  const detected = detectPackageSurfaces(packageRoot);
  const byName = /* @__PURE__ */ new Map();
  for (const surface of detected.surfaces) {
    byName.set(surface.name, [...byName.get(surface.name) ?? [], surface]);
  }
  const surfaces = [];
  const conflicts = [];
  for (const [name, claims] of byName) {
    if (claims.length > 1) {
      conflicts.push({ name, packages: claims.map((c) => c.package).sort() });
      continue;
    }
    const { package: pkg, packageDir: _dir, ...entry } = claims[0];
    surfaces.push({ ...entry, source: { kind: "package", package: pkg } });
  }
  const shadowed = [];
  for (const entry of registry.surfaces) {
    const claims = byName.get(entry.name);
    if (claims) {
      if (claims.length === 1)
        shadowed.push({ name: entry.name, byPackage: claims[0].package });
      continue;
    }
    surfaces.push({ ...entry, source: { kind: "registry" } });
  }
  surfaces.sort((a, b) => a.name.localeCompare(b.name));
  return { surfaces, brokenFiles: registry.broken, brokenManifests: detected.broken, shadowed, conflicts };
}

// floe-cli/dist/prompt-state.js
import { existsSync as existsSync4, mkdirSync as mkdirSync2, readFileSync as readFileSync4, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname } from "node:path";
function statePath(configPath, config) {
  return resolveLocalPath(configPath, config.home, "./asked.json");
}
function read(configPath, config) {
  const path = statePath(configPath, config);
  if (!existsSync4(path))
    return {};
  try {
    return JSON.parse(readFileSync4(path, "utf8"));
  } catch {
    return {};
  }
}
function hasBeenAsked(configPath, config, key) {
  return read(configPath, config)[key] !== void 0;
}
function markAsked(configPath, config, key) {
  const path = statePath(configPath, config);
  const record = read(configPath, config);
  record[key] = { asked_at: (/* @__PURE__ */ new Date()).toISOString() };
  mkdirSync2(dirname(path), { recursive: true });
  writeFileSync2(path, JSON.stringify(record, null, 2), "utf8");
}

// floe-cli/dist/service.js
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync as rmSync3, writeFileSync as writeFileSync3 } from "node:fs";
import { tmpdir } from "node:os";
import { join as join4 } from "node:path";
var WINDOWS_TASK_NAME = "FloeSubstrate";
function serviceStatus(taskName = WINDOWS_TASK_NAME) {
  if (process.platform !== "win32") {
    return {
      platform: process.platform,
      supported: false,
      installed: false,
      detail: `Auto-start is not built for ${process.platform} yet \u2014 only Windows is implemented.`
    };
  }
  const installed = windowsTaskExists(taskName);
  return {
    platform: "win32",
    supported: true,
    installed,
    detail: installed ? `Installed: scheduled task '${taskName}' starts Floe when you log in.` : "Not installed. Floe will not start automatically."
  };
}
function installService(configPath, cli, taskName = WINDOWS_TASK_NAME) {
  if (process.platform !== "win32") {
    return {
      ok: false,
      message: `Auto-start is not built for ${process.platform} yet. On Windows, Floe installs a per-user logon task. A systemd unit (Linux) and a launchd agent (macOS) are designed but not yet implemented, so nothing was installed rather than reporting a service that does not exist.`
    };
  }
  return installWindows(configPath, cli, taskName);
}
function uninstallService(taskName = WINDOWS_TASK_NAME) {
  if (process.platform !== "win32") {
    return { ok: false, message: `Nothing to uninstall on ${process.platform} \u2014 auto-start is not built there.` };
  }
  if (!windowsTaskExists(taskName)) {
    return { ok: true, message: `Auto-start was not installed (no scheduled task '${taskName}').` };
  }
  try {
    execFileSync("schtasks", ["/Delete", "/TN", taskName, "/F"], { stdio: "ignore" });
    return { ok: true, message: `Removed auto-start (scheduled task '${taskName}').` };
  } catch (error) {
    return { ok: false, message: `Could not remove scheduled task '${taskName}': ${errorText(error)}` };
  }
}
function windowsTaskExists(taskName) {
  try {
    execFileSync("schtasks", ["/Query", "/TN", taskName], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function installWindows(configPath, cli, taskName) {
  const user = process.env.USERNAME;
  if (!user) {
    return { ok: false, message: "Could not determine the current Windows account (USERNAME is not set)." };
  }
  const account = process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\${user}` : user;
  const argv = [...cli.prefixArgs, "--config", configPath, "start"];
  const argumentLine = argv.map(quoteArg).join(" ");
  const xml = buildWindowsTaskXml(account, cli.command, argumentLine, cli.workingDirectory);
  const dir = mkdtempSync(join4(tmpdir(), "floe-service-"));
  const xmlPath = join4(dir, "task.xml");
  try {
    writeFileSync3(xmlPath, `\uFEFF${xml}`, "utf16le");
    execFileSync("schtasks", ["/Create", "/TN", taskName, "/XML", xmlPath, "/F"], { stdio: "ignore" });
    return {
      ok: true,
      message: `Installed. Floe will start automatically when you log in (scheduled task '${taskName}').`
    };
  } catch (error) {
    return { ok: false, message: `Could not create scheduled task '${taskName}': ${errorText(error)}` };
  } finally {
    rmSync3(dir, { recursive: true, force: true });
  }
}
function buildWindowsTaskXml(account, command, argumentLine, workingDirectory) {
  const a = xmlEscape(account);
  return [
    `<?xml version="1.0" encoding="UTF-16"?>`,
    `<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">`,
    `  <RegistrationInfo>`,
    `    <Description>Start the Floe substrate when the user logs in.</Description>`,
    `  </RegistrationInfo>`,
    `  <Triggers>`,
    `    <LogonTrigger><Enabled>true</Enabled><UserId>${a}</UserId></LogonTrigger>`,
    `  </Triggers>`,
    `  <Principals>`,
    `    <Principal id="Author">`,
    `      <UserId>${a}</UserId>`,
    `      <LogonType>InteractiveToken</LogonType>`,
    `      <RunLevel>LeastPrivilege</RunLevel>`,
    `    </Principal>`,
    `  </Principals>`,
    `  <Settings>`,
    `    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>`,
    `    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>`,
    `    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>`,
    `    <StartWhenAvailable>true</StartWhenAvailable>`,
    `    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>`,
    `  </Settings>`,
    `  <Actions Context="Author">`,
    `    <Exec>`,
    `      <Command>${xmlEscape(command)}</Command>`,
    `      <Arguments>${xmlEscape(argumentLine)}</Arguments>`,
    `      <WorkingDirectory>${xmlEscape(workingDirectory)}</WorkingDirectory>`,
    `    </Exec>`,
    `  </Actions>`,
    `</Task>`
  ].join("\n");
}
function quoteArg(value) {
  return /\s/.test(value) ? `"${value}"` : value;
}
function xmlEscape(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

// floe-cli/dist/cli.js
var program2 = new Command();
program2.name("floe").description("Launch and manage the local Floe substrate").option("--config <path>", "config path");
program2.command("setup").description("Create config, start services, verify health, and offer to install auto-start").option("--yes", "accept setup defaults (install auto-start without prompting)").option("--no-autostart", "do not offer to install auto-start").option("--repair", "reconcile local service records").action(async (options) => {
  const { configPath, config } = ensureConfig(program2.opts().config);
  if (options.repair)
    clearRecords(configPath, config);
  await startAll(configPath, config);
  await verifyHealth(configPath, config);
  const currentWorkspace = findAncestorWithFloe(process.cwd());
  if (currentWorkspace) {
    await registerCurrentWorkspace(config, currentWorkspace, true);
  }
  console.log(`Floe services are running: ${config.bus.http_base_url}`);
  if (options.autostart !== false) {
    if (await offerServiceInstall(configPath, { assumeYes: options.yes === true })) {
      markAsked(configPath, config, "start_at_login");
    }
  }
  printSurfacesSummary(configPath, config);
});
program2.command("status").description("Show service health and configured URLs").action(async () => {
  const { configPath, config } = ensureConfig(program2.opts().config);
  await printStatus(configPath, config);
});
program2.command("start").description("Start local Floe services").action(async () => {
  const { configPath, config } = ensureConfig(program2.opts().config);
  await startAll(configPath, config);
  console.log("Started Floe services.");
});
program2.command("stop").description("Stop local Floe services").action(async () => {
  const { configPath, config } = ensureConfig(program2.opts().config);
  stopAllServices(configPath, config);
  console.log("Stopped Floe services.");
});
program2.command("restart").description("Restart local Floe services").action(async () => {
  const { configPath, config } = ensureConfig(program2.opts().config);
  stopAllServices(configPath, config);
  await startAll(configPath, config);
  console.log("Restarted Floe services.");
});
program2.command("logs").argument("[service]", "bus, bridge or identity").description("Print service logs").action((service2) => {
  const { configPath, config } = ensureConfig(program2.opts().config);
  const services = service2 ? [service2] : [...SERVICE_NAMES];
  for (const item of services) {
    const path = serviceLogPath(configPath, config, item);
    console.log(`
== ${item}: ${path} ==`);
    console.log(existsSync5(path) ? tail(readFileSync5(path, "utf8"), 200) : "(no log file)");
  }
});
program2.command("doctor").description("Diagnose local Floe setup").action(async () => {
  const { configPath, config } = ensureConfig(program2.opts().config);
  await printStatus(configPath, config);
  console.log(`Config: ${configPath}`);
  console.log(`Home: ${resolveLocalPath(configPath, config.home, ".")}`);
});
var configCommand = program2.command("config").description("Inspect local config");
configCommand.command("path").description("Print active config path").action(() => {
  const { configPath } = ensureConfig(program2.opts().config);
  console.log(configPath);
});
configCommand.command("edit").description("Open config in EDITOR or print path").action(() => {
  const { configPath } = ensureConfig(program2.opts().config);
  const editor = process.env.EDITOR || process.env.VISUAL;
  if (!editor) {
    console.log(configPath);
    return;
  }
  spawn2(editor, [configPath], { stdio: "inherit", shell: true });
});
var service = program2.command("service").description("Install/remove Floe auto-start on this machine");
service.command("install").description("Install Floe to start automatically on this machine").action(() => {
  const installation = thisInstallation();
  if (installation.dependencyOf) {
    console.error(directInstallRequiredMessage(installation));
    process.exitCode = 1;
    return;
  }
  const { configPath } = ensureConfig(program2.opts().config);
  const result = installService(configPath, cliInvocation());
  console.log(result.message);
  if (!result.ok)
    process.exitCode = 1;
});
service.command("uninstall").description("Remove Floe auto-start from this machine").action(() => {
  const result = uninstallService();
  console.log(result.message);
  if (!result.ok)
    process.exitCode = 1;
});
service.command("status").description("Show whether Floe is installed to auto-start").action(() => {
  const status = serviceStatus();
  console.log(status.detail);
});
program2.command("uninstall").description("Remove auto-start and stop services; preserve ~/.floe data").action(async () => {
  const { configPath, config } = ensureConfig(program2.opts().config);
  stopAllServices(configPath, config);
  const removal = uninstallService();
  console.log(removal.message);
  console.log("Removed Floe service entries. Local data is preserved.");
});
program2.command("reset").description("Factory reset: wipe all Floe state (workspaces, contexts, boards, agents) while preserving your identity, provider credentials and service config").option("--yes", "skip confirmation prompt").option("--include-identity", "also remove your identity from this machine (only its recovery phrase can bring it back)").action(async (options) => {
  const { configPath, config } = ensureConfig(program2.opts().config);
  stopAllServices(configPath, config);
  const includeIdentity = options.includeIdentity === true;
  const plan = buildResetPlan(configPath, config, { includeIdentity });
  console.log("\nFloe Factory Reset");
  console.log("==================");
  console.log("\nWILL WIPE:");
  for (const target of plan.wipe) {
    console.log(`  - ${target.label}`);
    console.log(`    ${target.path}`);
  }
  console.log("\nWILL PRESERVE:");
  for (const target of plan.preserve) {
    console.log(`  + ${target.label}`);
    console.log(`    ${target.path}`);
  }
  if (includeIdentity) {
    console.log("\nYour identity will be removed from this machine. The only way to get it back");
    console.log("is its recovery phrase (the words shown when it was created, or by");
    console.log("`floe identity reveal`). Without the phrase it is gone for good.");
  } else {
    console.log("\nYour identity is kept. Workspaces are wiped, so you will join folders again.");
  }
  console.log("");
  if (!options.yes) {
    const rl = createInterface3({ input, output });
    try {
      const answer = (await rl.question("This is destructive and cannot be undone. Continue? [y/N] ")).trim().toLowerCase();
      if (answer !== "y" && answer !== "yes") {
        console.log("Reset cancelled.");
        process.exit(0);
      }
    } finally {
      rl.close();
    }
  }
  executeReset(configPath, config, { includeIdentity });
  if (includeIdentity) {
    try {
      await forgetIdentityDeviceKey(floeHome(configPath, config));
    } catch (error) {
      console.error(`Could not remove the identity's device key from the credential vault: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log("\nReset complete. Run `floe setup` or `floe start` to start fresh.");
});
registerOperationsCommand(program2, {
  client: () => new CliOperationClient(nativeOperationBroker(ensureConfig(program2.opts().config).config.bus.http_base_url))
});
registerIdentityCommand(program2, {});
var surfaceCommand = program2.command("surface").description("List and manage surfaces (how you use Floe)");
surfaceCommand.command("list").description("List detected and registered surfaces").action(() => {
  const { configPath, config } = ensureConfig(program2.opts().config);
  const catalog = buildSurfaceCatalog(configPath, config);
  reportCatalogProblems(catalog);
  if (catalog.surfaces.length === 0) {
    printNoSurfaces(config);
  }
  for (const surface of catalog.surfaces) {
    const from = surface.source.kind === "package" ? `package ${surface.source.package}` : "registry file";
    console.log(`${surface.name}  \u2014  ${surface.label}  (${from})`);
  }
  for (const item of catalog.shadowed) {
    console.log(`(registry file '${item.name}.yaml' is unused: installed package ${item.byPackage} declares the same surface)`);
  }
});
surfaceCommand.command("register").description("Register a surface that is not an npm package (packages declare floe.surface in package.json instead)").requiredOption("--name <name>", "stable id a person can type (lowercase, digits, hyphens)").requiredOption("--label <label>", "human label shown when choosing a surface").requiredOption("--command <command>", "command that launches the surface").option("--arg <arg>", "launch argument (repeat for several)", collectArg, []).action((options) => {
  const { configPath, config } = ensureConfig(program2.opts().config);
  try {
    const entry = registerSurface(configPath, config, {
      name: options.name,
      label: options.label,
      launch: { command: options.command, args: options.arg }
    });
    console.log(`Registered surface '${entry.name}'. Run \`floe\` (or \`floe ${entry.name}\`) to launch it.`);
  } catch (error) {
    console.error(`Could not register surface: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
});
surfaceCommand.command("remove").description("Remove a surface from the registry").argument("<name>", "surface name").action((name) => {
  const { configPath, config } = ensureConfig(program2.opts().config);
  if (removeSurface(configPath, config, name)) {
    console.log(`Removed surface '${name}'.`);
    return;
  }
  const fromPackage = buildSurfaceCatalog(configPath, config).surfaces.find((surface) => surface.name === name && surface.source.kind === "package");
  console.log(fromPackage && fromPackage.source.kind === "package" ? `Surface '${name}' comes from the installed package ${fromPackage.source.package}. Uninstall it with: npm rm -g ${fromPackage.source.package}` : `No surface named '${name}' is registered.`);
});
program2.command("up").description("Ensure the Floe substrate is reachable (starting it if this machine allows), without launching anything").action(async () => {
  await runUp();
});
program2.command("launch [surface]").description("Ensure the substrate is reachable, then launch a surface (the default action)").action(async (surface) => {
  await runLauncher(surface);
});
await program2.parseAsync(routeSurfaceLaunch(normalizeLegacyCommandArgs(process.argv)));
async function runUp() {
  const { configPath, config } = ensureConfig(program2.opts().config);
  const plan = await ensureSubstrateForClient(configPath, config);
  if (plan === "blocked") {
    printServiceNotRunning(config);
    await offerServiceInstall(configPath, { assumeYes: false });
    process.exitCode = 1;
    return;
  }
  if (plan === "connect")
    await reportVersionMismatch(config);
  console.log(`Floe is running: ${config.bus.http_base_url}`);
}
async function reportVersionMismatch(config) {
  const message = describeVersionMismatch(config.bus.http_base_url, thisInstallation().version, await runningBusVersion(config.bus.http_base_url));
  if (message)
    console.warn(message);
}
async function runLauncher(surfaceName) {
  const { configPath, config } = ensureConfig(program2.opts().config);
  const plan = await ensureSubstrateForClient(configPath, config);
  if (plan === "blocked") {
    printServiceNotRunning(config);
    await offerServiceInstall(configPath, { assumeYes: false });
    process.exitCode = 1;
    return;
  }
  if (plan === "connect")
    await reportVersionMismatch(config);
  await registerCwdWorkspaceBestEffort(config);
  if (!hasBeenAsked(configPath, config, "start_at_login")) {
    if (await offerServiceInstall(configPath, { assumeYes: false })) {
      markAsked(configPath, config, "start_at_login");
    }
  }
  const catalog = buildSurfaceCatalog(configPath, config);
  reportCatalogProblems(catalog);
  const { surfaces } = catalog;
  if (surfaceName) {
    const found = surfaces.find((surface) => surface.name === surfaceName);
    if (!found) {
      console.error(`No surface named '${surfaceName}' is installed.`);
      if (surfaces.length > 0) {
        console.error(`Installed surfaces: ${surfaces.map((surface) => surface.name).join(", ")}`);
      } else {
        printNoSurfaces(config);
      }
      process.exitCode = 1;
      return;
    }
    await launchAndPropagate(found);
    return;
  }
  if (surfaces.length === 0) {
    console.log(`Floe services are running: ${config.bus.http_base_url}`);
    console.log("");
    printNoSurfaces(config);
    return;
  }
  if (surfaces.length === 1) {
    await launchAndPropagate(surfaces[0]);
    return;
  }
  const chosen = await promptChooseSurface(surfaces);
  if (chosen)
    await launchAndPropagate(chosen);
}
async function registerCwdWorkspaceBestEffort(config) {
  const currentWorkspace = findAncestorWithFloe(process.cwd());
  if (!currentWorkspace)
    return;
  try {
    await registerCurrentWorkspace(config, currentWorkspace, true);
  } catch (error) {
    console.warn(`Note: could not register the current workspace: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function printServiceNotRunning(config) {
  console.error(`The Floe substrate is not running at ${config.bus.http_base_url}.`);
  console.error("This machine is set not to start it on demand (services.start_on_demand is off),");
  console.error("so Floe is expected to be running as a managed service here.");
  console.error("Start it now with `floe start`, or have this machine start it for you:");
}
async function offerServiceInstall(configPath, opts) {
  const installation = thisInstallation();
  if (installation.dependencyOf) {
    console.log(directInstallRequiredMessage(installation));
    return false;
  }
  const status = serviceStatus();
  if (status.installed)
    return false;
  if (!status.supported) {
    console.log(status.detail);
    return true;
  }
  let yes = opts.assumeYes;
  if (!yes) {
    if (!input.isTTY)
      return false;
    const rl = createInterface3({ input, output });
    const answer = await rl.question("Install Floe to start automatically on this machine? [Y/n] ");
    rl.close();
    yes = !answer.trim().toLowerCase().startsWith("n");
  }
  if (!yes)
    return true;
  const result = installService(configPath, cliInvocation());
  console.log(result.message);
  return true;
}
function cliInvocation() {
  const entry = resolve4(process.argv[1]);
  return { command: process.execPath, prefixArgs: [...process.execArgv, entry], workingDirectory: dirname2(entry) };
}
async function launchAndPropagate(entry) {
  console.log(`Launching ${entry.label}\u2026`);
  try {
    process.exitCode = await launchSurface(entry);
  } catch (error) {
    console.error(`Could not launch ${entry.label}: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`Check its launch command: ${[entry.launch.command, ...entry.launch.args].join(" ")}`);
    process.exitCode = 1;
  }
}
async function promptChooseSurface(surfaces) {
  console.log("Which surface would you like to open?");
  surfaces.forEach((surface, index) => console.log(`  ${index + 1}. ${surface.label}  (${surface.name})`));
  const rl = createInterface3({ input, output });
  try {
    const answer = (await rl.question("Enter a number or name: ")).trim();
    const byIndex = Number.parseInt(answer, 10);
    if (Number.isInteger(byIndex) && byIndex >= 1 && byIndex <= surfaces.length)
      return surfaces[byIndex - 1];
    const byName = surfaces.find((surface) => surface.name === answer);
    if (byName)
      return byName;
    console.error(`'${answer}' did not match a surface.`);
    return null;
  } finally {
    rl.close();
  }
}
function printSurfacesSummary(configPath, config) {
  const catalog = buildSurfaceCatalog(configPath, config);
  reportCatalogProblems(catalog);
  const { surfaces } = catalog;
  if (surfaces.length === 0) {
    console.log("");
    printNoSurfaces(config);
    return;
  }
  console.log(`Installed surfaces: ${surfaces.map((surface) => surface.name).join(", ")}. Run \`floe\` to launch.`);
}
function printNoSurfaces(_config) {
  console.log("Surfaces are how you use Floe \u2014 a surface is what you actually interact with.");
  console.log("None are installed yet. Install a surface globally with npm, then run `floe`.");
  console.log("A surface that is not an npm package can be registered by hand:");
  console.log('  floe surface register --name <name> --label "<label>" --command <command>');
}
function reportCatalogProblems(catalog) {
  for (const item of catalog.brokenFiles) {
    console.warn(`Ignoring unreadable surface file '${item.file}': ${item.reason}`);
  }
  for (const item of catalog.brokenManifests) {
    console.warn(`Ignoring package ${item.package}: its floe.surface declaration is invalid (${item.reason})`);
  }
  for (const item of catalog.conflicts) {
    console.warn(`Not offering surface '${item.name}': it is declared by more than one installed package (${item.packages.join(", ")}). Uninstall all but one.`);
  }
}
function collectArg(value, previous) {
  return [...previous, value];
}
async function verifyHealth(configPath, config) {
  await waitForBusHealth(configPath, config);
}
async function printStatus(configPath, config) {
  const records = readRecords(configPath, config);
  for (const service2 of SERVICE_NAMES) {
    const record = records[service2];
    const running = record ? isPidRunning(record.pid) : false;
    console.log(`${service2}: ${running ? "running" : "not running"}${record ? ` pid=${record.pid}` : ""}`);
  }
  const busVersion = await runningBusVersion(config.bus.http_base_url);
  const healthy = await isHealthy(config.bus.http_base_url);
  console.log(`bus: ${config.bus.http_base_url} ${healthy ? `healthy${busVersion ? ` (Floe ${busVersion})` : ""}` : "unreachable"}`);
  const installation = thisInstallation();
  console.log(`this copy: Floe ${installation.version ?? "(unknown version)"}${installation.dependencyOf ? `, installed as part of ${installation.dependencyOf}` : ""}`);
  const mismatch = healthy ? describeVersionMismatch(config.bus.http_base_url, installation.version, busVersion) : null;
  if (mismatch)
    console.log(mismatch);
  const agent = await probeAgent(floeHome(configPath, config));
  if (!agent) {
    console.log("identity agent: not answering");
    return;
  }
  const state = agent.state;
  console.log(`identity agent: answering${agent.version ? ` (Floe ${agent.version})` : ""}`);
  console.log(`identity: ${state.kind === "none" || !state.kind ? "none yet" : `${state.display_name} ${state.npub} (${state.kind})`}`);
}
function stopAllServices(configPath, config) {
  for (const service2 of [...SERVICE_NAMES].reverse())
    stopService(configPath, config, service2);
}
async function registerCurrentWorkspace(config, locator, initAuthorized) {
  await registerLocalWorkspaceViaBroker(locator, initAuthorized, config.bus.http_base_url);
}
function findAncestorWithFloe(start) {
  let current = resolve4(start);
  while (true) {
    if (existsSync5(join5(current, ".floe")))
      return current;
    const parent = dirname2(current);
    if (parent === current)
      return null;
    current = parent;
  }
}
function tail(text, lines) {
  const parts = text.split(/\r?\n/);
  return parts.slice(Math.max(0, parts.length - lines)).join("\n");
}
function routeSurfaceLaunch(argv) {
  const known = /* @__PURE__ */ new Set();
  for (const command of program2.commands) {
    known.add(command.name());
    for (const alias of command.aliases())
      known.add(alias);
  }
  const head = argv.slice(0, 2);
  const rest = argv.slice(2);
  const optionsTakingValue = /* @__PURE__ */ new Set(["--config"]);
  const passthrough = /* @__PURE__ */ new Set(["--help", "-h", "--version", "-V"]);
  let index = 0;
  while (index < rest.length) {
    const token = rest[index];
    if (passthrough.has(token))
      return argv;
    if (token.startsWith("-")) {
      index += optionsTakingValue.has(token) ? 2 : 1;
      continue;
    }
    break;
  }
  if (index >= rest.length)
    return [...head, ...rest, "launch"];
  if (known.has(rest[index]))
    return argv;
  return [...head, ...rest.slice(0, index), "launch", ...rest.slice(index)];
}
function normalizeLegacyCommandArgs(argv) {
  const map = {
    "--start": "start",
    "--stop": "stop",
    "--status": "status",
    "--doctor": "doctor",
    "--restart": "restart",
    "--setup": "setup",
    "--logs": "logs",
    "--uninstall": "uninstall"
  };
  let commandInjected = false;
  const normalized = [...argv.slice(0, 2)];
  for (const token of argv.slice(2)) {
    if (!commandInjected && map[token]) {
      normalized.push(map[token]);
      commandInjected = true;
      continue;
    }
    normalized.push(token);
  }
  return normalized;
}
