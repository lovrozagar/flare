#!/usr/bin/env bun
import { Command } from "commander"
import { registerAdd } from "./commands/add"
import { registerCodegen } from "./commands/codegen"
import { registerGen } from "./commands/gen"
import { registerInit } from "./commands/init"
import { registerRoutes } from "./commands/routes"
import { registerStatus } from "./commands/status"
import { registerValidate } from "./commands/validate"

const program = new Command()
	.name("flare")
	.description("The AI-first web framework CLI")
	.version("0.0.1")

registerAdd(program)
registerCodegen(program)
registerGen(program)
registerInit(program)
registerRoutes(program)
registerStatus(program)
registerValidate(program)

const stubs = ["plan", "remove", "rename", "setup-ai"]
for (const name of stubs) {
	program
		.command(name)
		.description("Coming soon")
		.action(() => {
			process.stderr.write(`flare ${name} is not yet implemented.\n`)
			process.exit(1)
		})
}

program.parse()
