#!/usr/bin/env node
import { runBin } from "./codegen.ts";

// The `flare` bin: one command, reported through the exit code. It is the package's only module with a top-level
// effect, and no entry imports it.
process.exitCode = runBin(process.argv.slice(2), process.cwd(), console);
