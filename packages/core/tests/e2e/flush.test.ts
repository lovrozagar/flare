import type { Page } from "@playwright/test"
import { expect, it } from "vitest"
import { flushEvents } from "./flush.ts"

type Handler = (route: { fulfill: (response: { status: number }) => Promise<void> }) => Promise<void> | void

// Playwright's order for one marker, as this double models it: the page's request and console events reach the test, and
// the route event that runs the handler can come after both, in a later task. That order is the reading of two grids'
// logged `response 404 /__flush/<uuid>` (BUGS.md 133), not something the double proves. `failed` is a marker whose
// request ends before any route sees it, as when the page navigates or closes with the fetch in flight.
function markerPage(fate: "late route" | "failed"): { page: Page; outcome: () => string } {
	const handlers = new Map<string, Handler>()
	const waiters: { name: string; matches: (value: unknown) => boolean; resolve: (value: unknown) => void }[] = []
	let outcome = "pending"
	const emit = (name: string, value: unknown): void => {
		for (const waiter of waiters.filter((item) => item.name === name && item.matches(value))) waiter.resolve(value)
	}
	const page = {
		route: async (pattern: string, handler: Handler) => void handlers.set(pattern, handler),
		unroute: async (pattern: string) => void handlers.delete(pattern),
		waitForEvent: (name: string, matches: (value: unknown) => boolean) =>
			new Promise((resolve) => waiters.push({ name, matches, resolve })),
		evaluate: async (_run: unknown, marker: string) => {
			emit("request", { url: () => `http://127.0.0.1${marker}` })
			emit("console", { text: () => marker })
			setTimeout(() => {
				if (fate === "failed") return void emit("requestfailed", { url: () => `http://127.0.0.1${marker}` })
				const handler = handlers.get(`**${marker}`)
				// No handler left: Playwright sends the request on to the server, which answers 404 (BUGS.md 127.1).
				if (handler === undefined) outcome = "sent to the server"
				else void handler({ fulfill: async () => void (outcome = "fulfilled") })
			}, 5)
		},
	}
	return { page: page as unknown as Page, outcome: () => outcome }
}

// The marker request is answered by the flush's own route, never by the server: the route stays until its handler ran,
// so a late route event cannot fall through to a 404 that the page then logs as an error (BUGS.md 133).
it("route until handled", async () => {
	const { page, outcome } = markerPage("late route")
	await flushEvents(page)
	await new Promise((resolve) => setTimeout(resolve, 20))
	expect(outcome()).toBe("fulfilled")
})

// A marker whose request failed never reaches the route, and could never reach the server, so the flush ends there
// rather than waiting for a handler that cannot run.
it("failed marker ends", async () => {
	const { page } = markerPage("failed")
	const ended = await Promise.race([
		flushEvents(page).then(() => "ended"),
		new Promise((resolve) => setTimeout(() => resolve("still waiting"), 500)),
	])
	expect(ended).toBe("ended")
})
