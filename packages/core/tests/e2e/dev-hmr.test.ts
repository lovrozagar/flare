import { readFileSync, writeFileSync } from "node:fs"
import type { Page } from "@playwright/test"
import { bootCopy } from "./copy-boot.ts"
import { expect, isProd, serverOf, test, watch } from "./docs.fixture.ts"

// Edits a file of the private copy once, then waits until the page shows it and has settled: hydrated, its modules
// loaded. Vite drops an update that reaches a page still loading, so the next edit waits for that, as a person's
// does; a full reload in Firefox loads the dev module graph again, seconds on a cold copy.
async function edit(page: Page, at: { file: string; change: (text: string) => string; shows: () => Promise<void> }) {
	writeFileSync(at.file, at.change(readFileSync(at.file, "utf8")))
	const shown = () =>
		at.shows().then(
			() => true,
			() => false,
		)
	await expect.poll(shown, { message: at.file, timeout: 20_000 }).toBe(true)
	await page.locator("html[data-flare-hydrated]").waitFor({ state: "attached" })
	await page.waitForLoadState("networkidle")
}

// Firefox warns of each module load a full reload cut short, which an edit's reload does by design.
const CUT_SHORT = "Loading failed for the module with source"

// In `vite dev` an edit reaches the open page with no reload by hand: a page module, the root layout, and a server
// function file written after the dev server started, which the page then calls (plan 21 5.7). The edits are on a
// private copy of the minimal app (B70, BUGS.md 111).
test("route, layout, and new server function", async ({ page }, info) => {
	test.skip(isProd(info) || serverOf(info).startsWith("workers"), "the Node and Bun dev server")
	const session = await bootCopy({ app: "minimal", runtime: serverOf(info).split("-")[0] ?? "node" })
	try {
		const problems = watch(page)
		const routes = `${session.appDir}/src/routes/_root_`
		await page.goto(`${session.origin}/about`)
		await page.waitForLoadState("networkidle")
		const shows = (text: string) => () => expect(page.locator("body")).toContainText(text, { timeout: 500 })
		await edit(page, {
			file: `${routes}/about/about.page.tsx`,
			change: (text) => text.replace('title: "About"', 'title: "About again"'),
			shows: shows("About again"),
		})
		await edit(page, {
			file: `${routes}/root.root-layout.tsx`,
			change: (text) => text.replace(">About</Link>", ">About us</Link>"),
			shows: shows("About us"),
		})
		writeFileSync(
			`${session.appDir}/src/fns/shout.ts`,
			'import { createServerFn } from "@lovrozagar/flare/server-fn"\n\nexport const shout = createServerFn().handler(() => "loud")\n',
		)
		await page.goto(`${session.origin}/echo`)
		await page.waitForLoadState("networkidle")
		const echo = `${routes}/echo/echo.page.tsx`
		await edit(page, {
			file: echo,
			change: (text) =>
				text
					.replace('import { echo } from "../../../fns/echo.ts"', 'import { shout } from "../../../fns/shout.ts"')
					.replace('echo({ text: "pong" })', "shout()"),
			shows: async () => {
				await page.locator("#call").click({ timeout: 500 })
				await expect(page.locator("#echo")).toHaveText("loud", { timeout: 1000 })
			},
		})
		expect(problems.filter((problem) => !problem.includes("[vite]") && !problem.includes(CUT_SHORT))).toEqual([])
	} finally {
		await session.close()
	}
})
