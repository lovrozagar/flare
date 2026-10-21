import { writeFileSync } from "node:fs"
import { expect, test as base } from "@playwright/test"
import { removeAfterFloor } from "./floor.ts"
import { httpClient, type HttpClient } from "./http.ts"
import { attachServerLog, logMarks } from "./server-log.ts"

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

// The worker option the `node-prod-floor` project sets: every context it opens deletes the APIs above the browser floor
// before any page script runs (floor.ts, decision B123).
export type FloorOptions = { floor: boolean }

// Every e2e spec's `test`: the crash watch and the navigation log run around each case on its own context, and a failed
// case carries the log, and what each live boot's server logged during the case (server-log.ts). `http` is the case's own HTTP client, a connection per call (http.ts, BUGS.md 125); specs use it
// rather than Playwright's `request` (grid.test `http client only`).
export const test = base.extend<{ crashGuard: void; http: HttpClient }, FloorOptions>({
	floor: [false, { option: true, scope: "worker" }],
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
			const marks = logMarks()
			await use()
			// A file in the case's output directory, which CI uploads; a body attachment is not written there.
			if (testInfo.status !== testInfo.expectedStatus) {
				const path = testInfo.outputPath("navigation-log.txt")
				writeFileSync(path, `${log().join("\n")}\n`)
				await testInfo.attach("navigation log", { path, contentType: "text/plain" })
				await attachServerLog(testInfo, marks)
			}
			check()
		},
		{ auto: true },
	],
})

export { expect }
