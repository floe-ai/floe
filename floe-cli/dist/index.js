#!/usr/bin/env node
import { createRequire as __floeCreateRequire } from 'node:module'; const require = __floeCreateRequire(import.meta.url);
import {
  printCliFailure,
  reportCliFailure
} from "./chunk-IO6DTE5U.js";

// floe-cli/dist/index.js
try {
  const { runCli } = await import("./cli-X5MVVNFO.js");
  await runCli(process.argv);
} catch (error) {
  printCliFailure(reportCliFailure(error, {
    argv: process.argv,
    debug: process.argv.includes("--debug")
  }));
  process.exitCode = 1;
}
