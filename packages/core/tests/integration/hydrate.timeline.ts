import { spawnSync } from "node:child_process"
import type { ServerResponse } from "node:http"
import type { Socket } from "node:net"
import type { Page } from "@playwright/test"

// Both sides of a document that does not load (BUGS.md 504). The server timeline holds each app request the harness
// served: when it came in, when the app answered and with what status, every body chunk with its byte count and its
// tail, and whether the body ended, failed, or was still open, then when the harness wrote the answer and whether it
// reached the socket. The page timeline holds what Playwright saw of each request: its start, its response, and its
// end or failure. Both read the server timeline's clock, so a request's start on the page and its arrival at the server
// compare directly, and each server line names its socket (the browser's port and which request on it this was), so a
// request on a kept-alive socket reads apart from one on a fresh socket (504.6).

const TAIL = 60

type Served = { url: string; socket: string; events: string[]; body: "open" | "ended" | "failed" }

export type ServerTimeline = {
	// A request the harness took for the app on `socket`; the returned handle records the rest of its life.
	request: (url: string, socket: Socket) => ServedRequest
	// Milliseconds since the harness started, the one clock both timelines read.
	clock: () => string
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
	const requests = new WeakMap<Socket, number>()
	return {
		clock: at,
		mark: () => served.length,
		request(url, socket) {
			const count = (requests.get(socket) ?? 0) + 1
			requests.set(socket, count)
			const named = `port ${String(socket.remotePort)}, socket request ${count}`
			const entry: Served = { url, socket: named, events: [`in ${at()}`], body: "open" }
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
						`server ${entry.url} (${entry.socket}): ${entry.events.join(", ")}${entry.body === "open" ? `, body never ended (open at ${at()})` : ""}`,
				),
	}
}

// Every request the page makes, on the server timeline's clock: when each started, when its response came, and when
// it finished or failed, or that it was still in flight. Each time is when Playwright's event reached the harness, so a
// page's start can read a few ms after the server's arrival for the same request (BUGS.md 504.7). A page that does not hydrate shows whether its loads were
// progressing or stalled.
export function pageTimeline(tab: Page, origin: string, at: () => string): { lines: () => string[] } {
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

// The vitest workers beside the harness's own: the processes whose parent is its parent, by `ps`, which Linux and
// macOS both have, so a Mac runner lists them too; unknown where `ps` is missing or fails (BUGS.md 504.7).
export function siblingWorkers(command = "ps"): number[] | undefined {
	const listed = spawnSync(command, ["-A", "-o", "pid=,ppid="], { encoding: "utf8" })
	if (listed.error !== undefined || listed.status !== 0) return undefined
	return listed.stdout.split("\n").flatMap((line) => {
		const [pid, ppid] = line.trim().split(/\s+/).map(Number)
		return pid !== undefined && ppid === process.ppid ? [pid] : []
	})
}

// Which vitest worker ran the case, and which of its siblings at the case's start have exited since. An exit is not
// a kill: vitest runs each file in its own fork, which exits when the file is done, so the line lists exits, and
// vitest's own "Worker exited unexpectedly" is what names a kill; a sibling's exit status is not ours to read. A
// recurrence of a hang compares the two (BUGS.md 485, 504.6).
export function workerLine(before: number[] | undefined, now: number[] | undefined = siblingWorkers()): string {
	if (before === undefined || now === undefined) return `harness worker ${process.pid}; workers unknown (no ps)`
	const gone = before.filter((pid) => !now.includes(pid))
	const exited = gone.length === 0 ? "none" : gone.join(" ")
	return `harness worker ${process.pid}; of ${before.length} workers at the case's start, exited since: ${exited} (an exit, not a kill: a worker exits when its file is done)`
}
