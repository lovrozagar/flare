import AxeBuilder from "@axe-core/playwright"
import { expect, open, serverOf, test } from "./docs.fixture.ts"
import { PAGES } from "./docs-pages.ts"

// Every page of the docs route map passes an axe scan against WCAG 2.1 A and AA, once its deferred values and fills
// have settled (plan 21 4.1, B143). The markup is the same on every server, so the scan runs once, on the production
// build in chromium. A violation names its rule and each element it found.
test.describe("axe", () => {
	test.beforeEach(({ browserName }, info) => {
		test.skip(browserName !== "chromium" || serverOf(info) !== "node-prod", "one engine and one server scan")
	})
	for (const { path } of PAGES) {
		test(path, async ({ page, docs }) => {
			await open(page, docs.origin, path)
			await page.waitForLoadState("networkidle")
			const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
			const found = result.violations.map(
				(violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
			)
			expect(found).toEqual([])
		})
	}
})
