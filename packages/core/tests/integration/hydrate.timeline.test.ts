import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { afterAll, beforeAll, expect, it } from "vitest"
import { startHarness, type Harness } from "./hydrate.harness.ts"
import { siblingWorkers, workerLine } from "./hydrate.timeline.ts"
import { appFrom } from "./harness-app.ts"

// A document whose body the server never ends: its deferred value never settles, so the stream stays open after the
// shell. The harness reads the whole body before it answers, so the page never loads (BUGS.md 504).
const OPEN = appFrom(`
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => props.children),
]))
const page = api.page
	.createPage("_root_/open")
	.loader(({ defer }) => ({ v: defer(() => new Promise(() => {}), { key: "v" }) }))
	.render((props) => {
		const value = api.deferred.useDeferred(() => props.loaderData.v)
		return api.solid.createComponent(api.solid.Loading, {
			fallback: api.h("p", "wait", () => "wait"),
			get children() { return api.h("p", "value", () => String(value())) },
		})
	})
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/open", path: "/open", module: page }] }) }
`)

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(import.meta.filename), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

// The error names the page's load still in flight and, from the server, the request, its status, the last chunk it
// sent with its bytes, and that the body never ended.
it("open body named", async () => {
	if (harness === undefined) throw new Error("the harness did not start")
	// The page starts well after the harness, so a page clock and a server clock that differ read apart.
	await new Promise((done) => setTimeout(done, 3000))
	const loading = harness.app("chromium", { app: OPEN, path: "/open", loadTimeout: 3000, client() {} })
	const error = await loading.then(
		() => new Error("the document loaded"),
		(caught: unknown) => caught,
	)
	const message = String(error)
	expect(message).toContain("the document did not load")
	expect(message).toMatch(/load \/open started \d+ms, in flight at \d+ms/)
	// One clock: the page's start and the server's arrival read close together, though the page started 3 s after the
	// harness. The page's start is when Playwright's request event reached the harness, which can trail the arrival,
	// so the two may read in either order: the bound is two-sided on purpose, and `>= 0` read -18 under load. It
	// still fails the 3 s gap two clocks gave (BUGS.md 504.6, 504.7).
	const started = Number(/load \/open started (\d+)ms/.exec(message)?.[1])
	const arrived = Number(/server \/open[^:]*: in (\d+)ms/.exec(message)?.[1])
	expect(Math.abs(arrived - started)).toBeLessThan(1500)
	// Which siblings exited depends on the files around this one, so only the line's shape is fixed.
	expect(message).toMatch(
		/harness worker \d+; of \d+ workers at the case's start, exited since: (none|\d+( \d+)*) \(an exit/,
	)
	expect(message).toMatch(
		/server \/open \(port \d+, socket request 1\): in \d+ms, answered 200 \d+ms, chunk 1 \d+ bytes \d+ms …".+"(, chunk \d+ .*)?, body never ended \(open at \d+ms\)/,
	)
}, 30_000)

// The worker listing reads `ps`, which Linux and macOS both have: on macOS the Linux-only /proc listing read
// "workers unknown on this OS", so a Mac runner, where BUGS.md 504's WebKit hang shows, could not tell a kill from an
// exit (CI run 39973286163, BUGS.md 504.7). This worker is one of its parent's children.
it("workers listed", () => {
	expect(siblingWorkers()).toContain(process.pid)
	const bin = mkdtempSync(join(tmpdir(), "flare-ps-"))
	try {
		const ps = join(bin, "ps")
		writeFileSync(ps, `#!/bin/sh\nprintf '  11 ${process.ppid}\\n  12 1\\n 13   ${process.ppid}\\n'\n`)
		chmodSync(ps, 0o755)
		expect(siblingWorkers(ps)).toEqual([11, 13])
	} finally {
		rmSync(bin, { recursive: true })
	}
})

// Where `ps` is missing or fails, the listing is unknown and the line says why, rather than throwing.
it("no ps", () => {
	expect(siblingWorkers(join(tmpdir(), "flare-no-such-ps"))).toBeUndefined()
	expect(siblingWorkers("false")).toBeUndefined()
	expect(workerLine(undefined, undefined)).toBe(`harness worker ${process.pid}; workers unknown (no ps)`)
})
