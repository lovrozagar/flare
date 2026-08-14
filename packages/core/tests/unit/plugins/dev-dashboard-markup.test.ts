import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const clientSrc = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), "../../../src/plugins/dev-dashboard/client.tsx"),
	"utf-8",
)

describe("dev dashboard markup", () => {
	it("ListItem wrapper is not a button (file opener is already a button)", () => {
		expect(clientSrc).not.toMatch(/<button\s+class="list-item"/)
	})

	it("ChainNode wrapper is not a button (file opener is already a button)", () => {
		expect(clientSrc).not.toMatch(/<button\s+class="cur-chain-node"/)
	})

	it("uses extracted matchRouteTree instead of an inline locale TODO matcher", () => {
		expect(clientSrc).toContain('from "./match-route-tree.ts"')
		expect(clientSrc).not.toContain("TODO: locale allow-list")
		expect(clientSrc).not.toMatch(/function matchRouteTree\(/)
	})
})
