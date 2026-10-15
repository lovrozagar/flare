import { readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"
import { breakdown } from "./breakdown.ts"

const budgetPath = new URL("./budget.json", import.meta.url)
const repo = fileURLToPath(new URL("../../../../", import.meta.url))

// The budget measures what ships: the minified bundle, gzipped. The plain build's module list shows what it holds.
// The measurement runs with PATH emptied, so no tool installed on the machine takes part, only the lockfile's (B35).
// The measured text carries no region marker and no checkout or temp path, so neither can move the number.
it("createPage alone", async () => {
	const path = process.env["PATH"]
	process.env["PATH"] = ""
	const result = await breakdown("shared/route-builder/page.ts", "createPage").finally(() => {
		process.env["PATH"] = path
	})
	expect(result.modules.map((share) => share.name).filter((name) => name.includes("client/navigation"))).toEqual([])
	expect(result.text).not.toContain("//#region")
	expect(result.text).not.toContain(repo)
	expect(result.text).not.toContain(tmpdir())
	const budget = JSON.parse(readFileSync(budgetPath, "utf8")) as Record<string, number>
	expect(budget.createPage).toBeTypeOf("number")
	expect(result.minified).toBeLessThanOrEqual(budget.createPage)
})
