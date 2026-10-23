import type { ServerResponse } from "node:http"
import type { Page } from "@playwright/test"

// Both sides of a document that does not load (BUGS.md 504). The server timeline holds each app request the harness
// served: when it came in, when the app answered and with what status, every body chunk with its byte count and its
// tail, and whether the body ended, failed, or was still open, then when the harness wrote the answer and whether it
// reached the socket. The page timeline holds what Playwright saw of each request: its start, its response, and its
// end or failure. Together they say whether the server or the browser stalled.

const TAIL = 60

type Served = { url: string; mark: number; events: string[]; body: "open" | "ended" | "failed" }

export type ServerTimeline = {
	// A request the harness took for the app; the returned handle records the rest of its life.
	request: (url: string) => ServedRequest
	// The lines of every request from `mark` on, each with its events in order and its body's state.
	lines: (mark: number) => string[]
	// The current mark: requests from now on.
	mark: () => number
}

export type ServedRequest = {
	answered: (status: number) => void
	chunk: (bytes: Uint8Array) => void
	ended: () => void
	failed: (error: unknown) => void
	// Called as the harness writes the answer: records that, and when the socket took it or closed before it did.
	sent: (res: ServerResponse) => void
}

export function serverTimeline(): ServerTimeline {
	const start = performance.now()
	const at = (): string => `${Math.round(performance.now() - start)}ms`
	const served: Served[] = []
	const decoder = new TextDecoder()
	return {
		mark: () => served.length,
		request(url) {
			const entry: Served = { url, mark: served.length, events: [`in ${at()}`], body: "open" }
			served.push(entry)
			const add = (event: string): void => void entry.events.push(event)
			let chunks = 0
			return {
				answered: (status) => add(`answered ${status} ${at()}`),
				chunk(bytes) {
					chunks += 1
					const tail = decoder.decode(bytes.slice(-TAIL)).replace(/\s+/g, " ")
					add(`chunk ${chunks} ${bytes.byteLength} bytes ${at()} …${JSON.stringify(tail)}`)
				},
				ended() {
					entry.body = "ended"
					add(`body ended ${at()}`)
				},
				failed(error) {
					entry.body = "failed"
					add(`body failed ${at()}: ${String(error)}`)
				},
				sent(res) {
					add(`written ${at()}`)
					res.once("finish", () => add(`flushed ${at()}`))
					res.once("close", () => add(`closed ${at()}`))
				},
			}
		},
		lines: (mark) =>
			served
				.slice(mark)
				.map(
					(entry) =>
						`server ${entry.url}: ${entry.events.join(", ")}${entry.body === "open" ? `, body never ended (open at ${at()})` : ""}`,
				),
	}
}

// Every request the page makes, timed from its first: when each started, when its response came, and when it
// finished or failed, or that it was still in flight. A page that does not hydrate shows whether its loads were
// progressing or stalled.
export function pageTimeline(tab: Page, origin: string): { lines: () => string[] } {
	const start = performance.now()
	const at = (): string => `${Math.round(performance.now() - start)}ms`
	const loads = new Map<unknown, { url: string; started: string; response?: string; ended?: string }>()
	tab.on("request", (request) => void loads.set(request, { url: request.url().replace(origin, ""), started: at() }))
	tab.on("response", (answer) => {
		const load = loads.get(answer.request())
		if (load !== undefined) load.response = `response ${answer.status()} ${at()}`
	})
	const end = (request: unknown, how: string): void => {
		const load = loads.get(request)
		if (load !== undefined) load.ended = `${how} ${at()}`
	}
	tab.on("requestfinished", (request) => end(request, "finished"))
	tab.on("requestfailed", (request) => end(request, `failed (${request.failure()?.errorText ?? "no reason"})`))
	return {
		lines: () =>
			[...loads.values()].map(
				(load) =>
					`load ${load.url} started ${load.started}, ${load.response === undefined ? "" : `${load.response}, `}${load.ended ?? `in flight at ${at()}`}`,
			),
	}
}
