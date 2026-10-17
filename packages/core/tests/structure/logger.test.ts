import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { expect, it } from "vitest"

// Only `server/lifecycle/logger.ts` may call `console` on the server; every other module there and in the adapters
// logs through it (dx/server.md Logger, 00-rules, BUGS.md 344). A comment may name `console`.
const core = join(import.meta.dirname, "../..")
const LOGGER = "src/server/lifecycle/logger.ts"

function sources(dir: string): string[] {
	return readdirSync(join(core, dir), { withFileTypes: true, recursive: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
		.map((entry) => relative(core, join(entry.parentPath, entry.name)))
}

it("console only in the logger", () => {
	const calls = ["src/server", "src/adapters"]
		.flatMap(sources)
		.filter((file) => file !== LOGGER)
		.flatMap((file) =>
			readFileSync(join(core, file), "utf8")
				.split("\n")
				.map((line, index) => ({ file, line: index + 1, code: line.replace(/\/\/.*$/, "") }))
				.filter(({ code }) => /\bconsole\./.test(code))
				.map(({ file: at, line }) => `${at}:${line}`),
		)
	expect(calls).toEqual([])
})
