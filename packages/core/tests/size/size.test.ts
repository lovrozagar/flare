import { readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"
import { breakdown, shipped } from "./breakdown.ts"

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

// The client entry's production bundle, minified as it ships, holds no dev-only code: the dev tab, the hot-channel
// events, the overlay's error payload, and the dev warnings sit behind `import.meta.env.DEV`, which a production bundle
// replaces with false (plan 21 3.17).
it("client without dev", async () => {
	const result = await shipped("client/boot/create-client.ts", "createClient")
	// The tab's code is its `flare:tab` announcement; the shared protocol's header name is a bare constant.
	for (const marker of ["flare:tab", "flare:error", "[flare:", "devErrorPayload"]) {
		expect([marker, result.text.includes(marker)]).toEqual([marker, false])
	}
}, 120_000)

// The whole client, and each client feature an app imports on its own, against its budget: the minified bundle gzipped,
// as it ships (plan 21 5.6). A change that grows one past its number fails here, so a growth is a decision, as B145's
// codec was.
it.each([
	["client/boot/create-client.ts", "createClient"],
	["shared/components/link.tsx", "Link"],
	["features/image/shared/index.ts", "Image"],
	["features/theme/shared/index.ts", "ThemeProvider"],
	["features/direction/shared/index.ts", "DirectionProvider"],
	["features/query/client/index.ts", "useSuspenseQuery"],
	["features/i18n/shared/index.ts", "useT"],
])(
	"budget %s %s",
	async (module, name) => {
		const budget = JSON.parse(readFileSync(budgetPath, "utf8")) as Record<string, number>
		expect(budget[name]).toBeTypeOf("number")
		expect((await shipped(module, name)).minified).toBeLessThanOrEqual(budget[name] ?? 0)
	},
	120_000,
)
