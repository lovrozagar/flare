import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"

// The repo's GitHub workflows, which the release job runs with publish credentials: every action is pinned to a commit
// SHA, so a moved tag cannot swap the code that runs, and nothing installs `@latest` (plan 21 14.4, BUGS.md 219).
const dir = fileURLToPath(new URL("../../../../.github/workflows/", import.meta.url))
const workflows = readdirSync(dir)
	.filter((name) => name.endsWith(".yml"))
	.toSorted()
	.map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }))

it("pinned actions", () => {
	expect(workflows.map((file) => file.name)).toEqual(["ci.yml", "release.yml"])
	const unpinned = workflows.flatMap(({ name, text }) =>
		[...text.matchAll(/uses:\s*(\S+)/g)]
			.map((found) => found[1] ?? "")
			.filter((action) => !/^[\w.-]+\/[\w.-]+@[\da-f]{40}$/.test(action))
			.map((action) => `${name}: ${action}`),
	)
	expect(unpinned).toEqual([])
})

it("nothing latest", () => {
	expect(workflows.filter(({ text }) => /@latest\b/.test(text)).map((file) => file.name)).toEqual([])
})
