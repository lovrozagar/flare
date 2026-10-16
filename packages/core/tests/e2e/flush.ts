import type { Page } from "@playwright/test"

// Every event the page sent before now has reached the test: the page logs a marker line and fetches a marker URL,
// and Playwright delivers one page's events in order, so a listener has seen each request, console line, and page
// error the page sent before both markers. A case that asserts something did not happen reads its record after this,
// not after a sleep. The route goes only after its handler answered: Playwright can deliver the route event after the
// request and console events, and a route removed before it would send the marker on to the server, whose 404 the page
// logs as an error (BUGS.md 133).
export async function flushEvents(page: Page): Promise<void> {
	const marker = `/__flush/${crypto.randomUUID()}`
	const pattern = `**${marker}`
	const handled = Promise.withResolvers<void>()
	await page.route(pattern, async (route) => {
		await route.fulfill({ status: 204 })
		handled.resolve()
	})
	const requested = page.waitForEvent("request", (request) => request.url().endsWith(marker))
	const logged = page.waitForEvent("console", (message) => message.text() === marker)
	await page.evaluate((url) => {
		console.log(url)
		void fetch(url)
	}, marker)
	await Promise.all([requested, logged, handled.promise])
	await page.unroute(pattern)
}
