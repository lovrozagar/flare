import type { Page } from "@playwright/test"
import { expect, it } from "vitest"
import { flushEvents } from "./flush.ts"

type Handler = (route: { fulfill: (response: { status: number }) => Promise<void> }) => Promise<void> | void

// Playwright's order for one marker: the page's request and console events reach the test, and the route event that
// runs the handler can come after both. A page whose route event comes last, in a later task, as it can on a loaded host.
function lateRoutePage(): { page: Page; outcome: () => string } {
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
	const { page, outcome } = lateRoutePage()
	await flushEvents(page)
	await new Promise((resolve) => setTimeout(resolve, 20))
	expect(outcome()).toBe("fulfilled")
})
