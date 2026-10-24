import { writeFileSync } from "node:fs"
import { expect, test as base } from "@playwright/test"
import { removeAfterFloor } from "./floor.ts"
import { httpClient, type HttpClient } from "./http.ts"
import { attachHostState, writeWorkerState } from "./host-state.ts"
import { attachServerLog, logMarks, serverLines } from "./server-log.ts"

// A page as the crash watch reads it, and the context that opens pages.
type CrashPage = { on(event: "crash", listener: () => void): unknown; url(): string }
type Watched = { pages(): readonly CrashPage[]; on(event: "page", listener: (page: CrashPage) => void): unknown }

// Every page the context has or opens is watched for a renderer crash. The returned check throws when one crashed,
// naming its URL, so a crash fails the case that owned the page even when the case never touched the page again
// (plan 14 leaf 4.6).
export function crashWatch(context: Watched): () => void {
	const crashed: string[] = []
	const watch = (page: CrashPage): void => void page.on("crash", () => crashed.push(page.url()))
	for (const page of context.pages()) watch(page)
	context.on("page", watch)
	return () => {
		if (crashed.length > 0) throw new Error(`A page crashed: ${crashed.join(", ")}`)
	}
}

// A page as the navigation log reads it: its main-frame navigations, its document requests, its failed requests, and
// its error responses.
type LoggedFrame = { url(): string; parentFrame(): unknown }
type LoggedRequest = { url(): string; resourceType(): string; failure(): { errorText: string } | null }
type LoggedResponse = { url(): string; status(): number }
type LoggedPage = {
	on(event: "framenavigated", listener: (frame: LoggedFrame) => void): unknown
	on(event: "request" | "requestfailed", listener: (request: LoggedRequest) => void): unknown
	on(event: "response", listener: (response: LoggedResponse) => void): unknown
}
type Logged = { pages(): readonly LoggedPage[]; on(event: "page", listener: (page: LoggedPage) => void): unknown }

// Every main-frame navigation and document request of every page the context has or opens, each timed from the watch's
// start as `<ms> <event> <url>`. Attached to a failed case, it shows whether a document really navigated when an
// evaluate reports its context destroyed, or whether the driver lost the context (BUGS.md 34.6). Each failed request,
// with its failure text, and each response at 400 or above are there too, so a failure only CI saw names the request
// behind it (BUGS.md 121).
export function navigationLog(context: Logged, now: () => number = () => performance.now()): () => string[] {
	const start = now()
	const lines: string[] = []
	const line = (event: string, url: string): void => void lines.push(`${Math.round(now() - start)} ${event} ${url}`)
	const watch = (page: LoggedPage): void => {
		page.on("framenavigated", (frame) => {
			if (frame.parentFrame() === null) line("framenavigated", frame.url())
		})
		page.on("request", (request) => {
			if (request.resourceType() === "document") line("document", request.url())
		})
		page.on("requestfailed", (request) =>
			line("requestfailed", `${request.url()} ${request.failure()?.errorText ?? ""}`),
		)
		page.on("response", (response) => {
			if (response.status() >= 400) line(`response ${response.status()}`, response.url())
		})
	}
	for (const page of context.pages()) watch(page)
	context.on("page", watch)
	return () => [...lines]
}

// A page as the request log reads it: every request it starts, its response, and how it ends.
type ListedRequest = { url(): string; resourceType(): string; failure(): { errorText: string } | null }
type ListedPage = {
	on(event: "request" | "requestfinished" | "requestfailed", listener: (request: ListedRequest) => void): unknown
	on(event: "response", listener: (response: { request(): ListedRequest; status(): number }) => void): unknown
}
type Listed = { pages(): readonly ListedPage[]; on(event: "page", listener: (page: ListedPage) => void): unknown }

type Entry = { url: string; type: string; started: number; response?: string; ended?: string }

// Every request of every page the context has or opens, timed from the watch's start. Given the server log a failed
// case carries (server-log.ts), it lists them with the ones still in flight first, newest first, as the one the case
// waited on is likely the last it started; each with its type, start, and end,
// and what the server trace saw of it: the k-th request to a path on a traced origin is that origin's k-th arrival of
// the path, `server: not seen` when there is none. A request the engine reported and the server never received reads
// apart from one the server answered and the engine never finished (BUGS.md 453.5, 504.10).
export function requestLog(
	context: Listed,
	now: () => number = () => performance.now(),
): (server: readonly string[]) => string[] {
	const start = now()
	const at = (): number => Math.round(now() - start)
	const entries = new Map<ListedRequest, Entry>()
	const watch = (page: ListedPage): void => {
		page.on(
			"request",
			(request) => void entries.set(request, { url: request.url(), type: request.resourceType(), started: at() }),
		)
		page.on("response", (response) => {
			const entry = entries.get(response.request())
			if (entry !== undefined) entry.response = `response ${response.status()} at ${at()}`
		})
		page.on("requestfinished", (request) => {
			const entry = entries.get(request)
			if (entry !== undefined) entry.ended = `finished at ${at()}`
		})
		page.on("requestfailed", (request) => {
			const entry = entries.get(request)
			if (entry !== undefined) entry.ended = `failed (${request.failure()?.errorText ?? "no reason"}) at ${at()}`
		})
	}
	for (const page of context.pages()) watch(page)
	context.on("page", watch)
	return (server) => {
		const seen = serverTrace(server)
		const taken = new Map<string, number>()
		const lines = [...entries.values()].map((entry) => {
			const key = keyOf(entry.url)
			const index = taken.get(key) ?? 0
			taken.set(key, index + 1)
			const state = [entry.response, entry.ended].filter((part) => part !== undefined).join(", ")
			const line = `${entry.started} ${entry.type} ${entry.url} ${state === "" ? "in flight" : state}`
			return { flying: entry.ended === undefined, line: `${line}; server: ${seen.get(key)?.[index] ?? "not seen"}` }
		})
		const flying = lines.filter((entry) => entry.flying)
		return [
			`in flight: ${flying.length} of ${lines.length} requests`,
			...flying.toReversed().map((entry) => entry.line),
			...lines.filter((entry) => !entry.flying).map((entry) => entry.line),
		]
	}
}

// A request's origin and path with its query, the key a trace line is matched by.
function keyOf(url: string): string {
	const parsed = new URL(url)
	return `${parsed.origin}${parsed.pathname}${parsed.search}`
}

// What the trace (trace.ts) saw of each request, by origin and path, in arrival order: `#<n> arrived`, then `answered
// <status>` once it finished, or `no answer`.
function serverTrace(server: readonly string[]): Map<string, string[]> {
	const byKey = new Map<string, string[]>()
	const states = new Map<string, { key: string; slot: number; status?: string }>()
	let origin = ""
	for (const line of server) {
		if (line.startsWith("== ")) origin = line.slice(3)
		const match = /^\[trace\] \d+ (#\d+) \S+ (\S+) (arrived|finish (\d+))/.exec(line)
		if (match === null) continue
		const [, id = "", path = "", event = "", status] = match
		const tag = `${origin} ${id}`
		if (event === "arrived") {
			const key = `${origin}${path}`
			const list = byKey.get(key) ?? []
			states.set(tag, { key, slot: list.push("") - 1 })
			byKey.set(key, list)
		} else {
			const state = states.get(tag)
			if (state !== undefined) state.status = status
		}
	}
	for (const [tag, state] of states) {
		const id = tag.slice(tag.lastIndexOf(" ") + 1)
		const list = byKey.get(state.key)
		if (list !== undefined)
			list[state.slot] = `${id} arrived, ${state.status === undefined ? "no answer" : `answered ${state.status}`}`
	}
	return byKey
}

// The worker option the `node-prod-floor` project sets: every context it opens deletes the APIs above the browser floor
// before any page script runs (floor.ts, decision B123).
export type FloorOptions = { floor: boolean }

// Every e2e spec's `test`: the crash watch and the navigation log run around each case on its own context, and a failed
// case carries the log, what each live boot's server logged during the case (server-log.ts), and the host's open
// files, sockets, memory, and processes (host-state.ts, BUGS.md 504.9). `http` is the case's own HTTP client, a
// connection per call (http.ts, BUGS.md 125); specs use it rather than Playwright's `request` (grid.test `http client
// only`).
export const test = base.extend<{ crashGuard: void; http: HttpClient }, FloorOptions & { hostBaseline: void }>({
	floor: [false, { option: true, scope: "worker" }],
	// Each worker writes its host state as it ends, the baseline a failed case's is read against (BUGS.md 504.9).
	hostBaseline: [
		// Playwright reads a fixture's dependencies from this pattern, so a fixture with none takes an empty one.
		// oxlint-disable-next-line no-empty-pattern
		async ({}, use, workerInfo) => {
			await use()
			await writeWorkerState(workerInfo.project.outputDir, workerInfo.workerIndex)
		},
		{ scope: "worker", auto: true },
	],
	context: async ({ context, floor }, use) => {
		if (floor) await context.addInitScript(removeAfterFloor)
		await use(context)
	},
	// Playwright reads a fixture's dependencies from this pattern, so a fixture with none takes an empty one.
	// oxlint-disable-next-line no-empty-pattern
	http: async ({}, use) => {
		const client = httpClient()
		await use(client)
		client.close()
	},
	crashGuard: [
		async ({ context }, use, testInfo) => {
			const check = crashWatch(context)
			const log = navigationLog(context)
			const requests = requestLog(context)
			const marks = logMarks()
			await use()
			// A file in the case's output directory, which CI uploads; a body attachment is not written there.
			if (testInfo.status !== testInfo.expectedStatus) {
				const path = testInfo.outputPath("navigation-log.txt")
				writeFileSync(path, `${[...log(), "== requests", ...requests(serverLines(marks))].join("\n")}\n`)
				await testInfo.attach("navigation log", { path, contentType: "text/plain" })
				await attachServerLog(testInfo, marks)
				await attachHostState(testInfo)
			}
			check()
		},
		{ auto: true },
	],
})

export { expect }
