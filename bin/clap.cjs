#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Interpreter, ClapError } = require("../src/clap.cjs");

function main(args = process.argv.slice(2)) {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log("Clap Class as Processor\n使い方: node bin/clap.cjs <file.clap>");
    return;
  }
  if (args.length !== 1) {
    console.error("使い方: node bin/clap.cjs <file.clap>");
    process.exitCode = 2;
    return;
  }

  try {
    const source = fs.readFileSync(path.resolve(args[0]), "utf8");
    new Interpreter().run(source);
  } catch (error) {
    if (error instanceof ClapError) {
      console.error("ClapError: " + error.message);
      process.exitCode = 1;
      return;
    }
    if (error && error.code === "ENOENT") {
      console.error("ファイルが見つかりません: " + args[0]);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

if (require.main === module) main();
module.exports = { main };
