import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { hostname } from "node:os"
import { boot } from "../packages/core/tests/e2e/boot.ts"
import { envelopeOf, fnId, wire } from "../packages/core/tests/e2e/docs.fixture.ts"
import { SafariSession, type Fetcher } from "./safari-driver.ts"
import { acquire, quote, release, type Lock, type Remote } from "./safari-lock.ts"

// `bun run verify:safari` (AGENTS.md, Every gate passes before moving on): the client's core flows in real Safari on
// the Mac, against a production docs server on this machine. It fails, and never skips, when the Mac, its driver, or
// this machine's address is not reachable: a Safari check that did not run is not a pass (BUGS.md 123: Playwright's
// WebKit missed what Safari 17.6 lacked).
//
// Inputs, by env: FLARE_SAFARI_SSH, the Mac's ssh destination (default `mac`); FLARE_SAFARI_DRIVER_PORT, the port
// `safaridriver -p` listens on there (default 4799); FLARE_SAFARI_HOST, this machine's address as the Mac reaches it
// (default the first address `tailscale ip -4` prints); FLARE_SAFARI_LOCK, the lock directory on the Mac (default
// /tmp/flare-safari.lock).
//
// One run at a time drives the Mac's Safari: a run takes the lock first (scripts/safari-lock.ts) and fails at once,
// naming the holder, while another holds it. A run stops at RUN_LIMIT_MS and closes what it opened, so a lock older
// than that is stale.
const RUN_LIMIT_MS = 20 * 60_000

export type SafariConfig = { ssh: string; driverPort: number; host: string }

export function configOf(env: Record<string, string | undefined>, tailscale: () => string): SafariConfig {
	const host = env["FLARE_SAFARI_HOST"] ?? tailscale().split("\n")[0]?.trim() ?? ""
	if (host === "") {
		throw new Error("verify:safari needs this machine's address as the Mac reaches it: set FLARE_SAFARI_HOST")
	}
	const driverPort = Number(env["FLARE_SAFARI_DRIVER_PORT"] ?? "4799")
	return { ssh: env["FLARE_SAFARI_SSH"] ?? "mac", driverPort, host }
}

// One flow: what it checks, and the failure it saw, or undefined when it passed.
export type Flow = { name: string; run: (safari: SafariSession, site: Site) => Promise<string | undefined> }
// The docs app as Safari reaches it (`origin`), and a server function called from this machine.
export type Site = { origin: string; callFn: (id: string, data: unknown) => Promise<unknown> }

const HYDRATED = "return document.documentElement.hasAttribute('data-flare-hydrated')"
const SCROLL = "return Math.round(window.scrollY)"
// A mark on the window survives a client navigation and dies with a document load, so a flow can tell a client
// navigation from the document-load fallback (BUGS.md 123.3).
const MARK = "window.__flareMark = 1"
const MARKED = "return window.__flareMark === 1"
const STEPS = ["resolve routes", "bundle client", "bundle server", "prerender pages", "write sitemap", "done"]
// Warm: the docs client marked idle and no resource arrived for a second, so the idle step's imports are in.
const WARMED = `const count = performance.getEntriesByType("resource").length;
if (!(window.__docsLifecycle ?? []).includes("idle") || count !== window.__lastCount) {
	window.__lastCount = count;
	window.__stableSince = performance.now();
	return false;
}
return performance.now() - window.__stableSince > 1000`
// The scripts fetched since window.__before, by URL: a route chunk, or one it imports.
const FETCHED = `return performance.getEntriesByType("resource").slice(window.__before)
	.map((entry) => entry.name).filter((name) => /\\.js$/.test(new URL(name).pathname))`
// Holds the next navigation's transition at ready, its animations paused in the same task, and records each
// ::view-transition pseudo-element it animates and each whose keyframes move it (a transform), as the e2e does.
const HOLD = `Document.prototype.startViewTransition = ((start) => function (arg) {
  const transition = start.call(this, arg);
  transition.ready.then(() => {
    const animated = [];
    const moved = [];
    for (const animation of document.getAnimations()) {
      animation.pause();
      const pseudo = (animation.effect && animation.effect.pseudoElement) || "";
      if (!pseudo.startsWith("::view-transition")) continue;
      animated.push(pseudo);
      if (animation.effect.getKeyframes().some((frame) => frame.transform !== undefined)) moved.push(pseudo);
    }
    window.__animated = animated;
    window.__moved = moved;
    window.__running = true;
  }, () => undefined);
  return transition;
})(Document.prototype.startViewTransition)`
const center = (css: string): string =>
	`const box = document.querySelector("${css}").getBoundingClientRect(); return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }`
const PRESS = [
	{ type: "pointerDown", button: 0 },
	{ type: "pointerUp", button: 0 },
]
const moveTo = (point: { x: number; y: number }): Record<string, unknown> => ({
	type: "pointerMove",
	duration: 0,
	origin: "viewport",
	...point,
})

// While a navigation's transition is held, from `top`: the content alone is captured and nothing moves, and the
// sidebar link under the pointer is hit, hovered, and a press on it navigates (B129).
async function pointerDuring(safari: SafariSession, site: Site, top: number): Promise<string | undefined> {
	await open(safari, `${site.origin}/docs/routing`)
	await safari.js(HOLD)
	await safari.js(`window.scrollTo(0, ${top})`)
	await safari.wait(`return Math.round(scrollY) === ${top}`)
	const link = "#sidebar a[href='/docs/defer']"
	const from = Object(await safari.js(center("#sidebar a[href='/docs/caching']"))) as { x: number; y: number }
	await safari.pointer([moveTo(from), ...PRESS])
	if (!(await safari.wait("return window.__running === true", 4000))) return "no view transition ran"
	// Where the live page has the link mid-transition: from a scrolled page the navigation lands at the top, and the
	// sticky sidebar moves with it.
	const target = Object(await safari.js(center(link))) as { x: number; y: number }
	const seen = Object(await safari.js("return { animated: window.__animated, moved: window.__moved }")) as {
		animated: string[]
		moved: string[]
	}
	if (!seen.animated.includes("::view-transition-old(flare-content)")) {
		return `the transition captured ${seen.animated.join(", ")}, not the content`
	}
	if (seen.moved.length > 0) return `the transition moves ${seen.moved.join(", ")}`
	const hit = await safari.js(
		`const element = document.elementFromPoint(${target.x}, ${target.y}); return element?.closest("a")?.getAttribute("href") ?? element?.tagName`,
	)
	await safari.pointer([moveTo(target)])
	const hovered = await safari.js(`return document.querySelector("${link}").matches(":hover")`)
	await safari.pointer(PRESS)
	await safari.js("for (const animation of document.getAnimations()) animation.finish()")
	if (hit !== "/docs/defer") return `the pointer hit ${String(hit)}, not the sidebar link`
	if (hovered !== true) return "the sidebar link was not hovered"
	const landed = await safari.wait("return location.pathname === '/docs/defer'")
	return landed ? undefined : "the click on the sidebar link was lost"
}

// From hydration on, what the page's own scripts log as a warning or an error, and what it throws, as the grid's
// `watch` does. safaridriver has no log endpoint, so this sees nothing the engine itself logs (BUGS.md 124.7).
const WATCH = `window.__flareProblems = [];
for (const level of ["warn", "error"]) {
	const original = console[level];
	console[level] = (...args) => { window.__flareProblems.push(level + ": " + args.map(String).join(" ")); original.apply(console, args) };
}
addEventListener("error", (event) => window.__flareProblems.push("error: " + event.message));
addEventListener("unhandledrejection", (event) => window.__flareProblems.push("unhandled: " + String(event.reason)))`
const PROBLEMS = "return window.__flareProblems ?? []"

async function open(safari: SafariSession, url: string): Promise<void> {
	await safari.go(url)
	if (!(await safari.wait(HYDRATED, 20_000))) throw new Error(`${url} never hydrated`)
	await safari.js(MARK)
	await safari.js(WATCH)
}

export const FLOWS: readonly Flow[] = [
	{
		name: "sidebar navigation from the bottom of a page",
		run: async (safari, site) => {
			await open(safari, `${site.origin}/docs/server-functions`)
			await safari.js("window.scrollTo(0, document.documentElement.scrollHeight)")
			await safari.wait("return window.scrollY > 300")
			await safari.click("#sidebar a[href='/docs/defer']")
			const landed = await safari.wait("return location.pathname === '/docs/defer' && /Defer/.test(document.title)")
			if (!landed) return `stuck at ${String(await safari.js("return location.pathname"))}`
			return (await safari.js(MARKED)) === true ? undefined : "the page loaded as a document"
		},
	},
	{
		name: "Back restores the scroll position",
		run: async (safari, site) => {
			await open(safari, `${site.origin}/docs/routing`)
			await safari.js("window.scrollTo(0, 900)")
			await safari.wait("return Math.round(window.scrollY) === 900")
			await safari.click("#nav a[href^='/api']")
			if (!(await safari.wait("return location.pathname.startsWith('/api')"))) return "the API link did not land"
			await safari.back()
			const restored = await safari.wait("return location.pathname === '/docs/routing' && Math.abs(scrollY - 900) < 2")
			if (!restored) return `Back left scrollY at ${String(await safari.js(SCROLL))}, not 900`
			return (await safari.js(MARKED)) === true ? undefined : "Back loaded a document"
		},
	},
	{
		// WebDriver scrolls a link into view before it clicks, so /hr's own position at the click is what Back restores.
		name: "Back restores the position at the click",
		run: async (safari, site) => {
			await open(safari, `${site.origin}/hr`)
			await safari.js(
				"document.querySelector(\"a[href='/hr/docs/media']\").addEventListener('click', () => { window.__at = Math.round(scrollY) }, { capture: true, once: true })",
			)
			await safari.click("a[href='/hr/docs/media']")
			if (!(await safari.wait("return location.pathname === '/hr/docs/media'"))) return "the media link did not land"
			// A forward document load would make Back a traversal the back-forward cache restores, mark and all, so the
			// forward step is proven a client navigation first; then Back is this document's own popstate.
			if ((await safari.js(MARKED)) !== true) return "the media link loaded as a document"
			// Read before Back: a document load on Back would lose it with the window.
			const at = Number(await safari.js("return window.__at"))
			await safari.js("window.scrollTo(0, document.documentElement.scrollHeight)")
			await safari.back()
			if (!(await safari.wait(`return location.pathname === '/hr' && Math.abs(scrollY - ${at}) < 2`))) {
				return `Back left scrollY at ${String(await safari.js(SCROLL))}, not ${at}`
			}
			// A document load restores the scroll on its own, so only the mark tells it from Flare's restore.
			return (await safari.js(MARKED)) === true ? undefined : "Back loaded a document"
		},
	},
	{
		name: "a streamed server function",
		run: async (safari, site) => {
			await open(safari, `${site.origin}/playground`)
			await safari.click("#stream-start")
			const done = await safari.wait("return document.querySelectorAll('#stream-log li').length === 6", 15_000)
			return done
				? undefined
				: `${String(await safari.js("return document.querySelectorAll('#stream-log li').length"))} of 6 lines`
		},
	},
	{
		// The playground's gated run sends each line only after a release, so each line must reach the page while the
		// server still holds the next: the stream is read as it arrives, not at its end.
		name: "the stream gate: each line arrives while the next is held",
		run: async (safari, site) => {
			const run = `safari${Date.now() % 100_000}`
			const hold = await site.callFn(fnId("src/fns/build-log.ts", "holdBuild"), { run })
			if (Reflect.get(Object(Reflect.get(Object(hold), "data")), "held") !== true) return "the gate did not hold"
			await open(safari, `${site.origin}/playground?run=${run}`)
			await safari.click("#stream-start")
			for (let count = 1; count <= STEPS.length; count += 1) {
				if (!(await safari.wait(`return document.querySelectorAll('#stream-log li').length === ${count}`))) {
					return `line ${count} never arrived`
				}
				if (count < STEPS.length) await site.callFn(fnId("src/fns/build-log.ts", "releaseBuild"), { run })
			}
			return (await safari.wait("return document.querySelector('#stream-status')?.textContent === 'done'"))
				? undefined
				: "the run never reported done"
		},
	},
	{
		// The docs router's `modules: "all"` warms every unloaded route once the page is idle, so a later client
		// navigation fetches no script: not its route chunk, nor a chunk that one imports. Safari has no rel=prefetch, so
		// this checks the import it gets instead (BUGS.md 124, decision B127).
		name: "modules warm in Safari",
		run: async (safari, site) => {
			await open(safari, `${site.origin}/docs/routing`)
			if (!(await safari.wait(WARMED, 15_000))) return "the idle step never settled"
			await safari.js(`window.__before = performance.getEntriesByType("resource").length`)
			await safari.click("#nav a[href='/playground']")
			if (!(await safari.wait("return location.pathname === '/playground'"))) return "the Playground link did not land"
			const fetched = await safari.js(FETCHED)
			const names = Array.isArray(fetched) ? fetched.map(String) : []
			return names.length === 0 ? undefined : `the navigation fetched ${names.length} script(s): ${names.join(", ")}`
		},
	},
	{
		// Playwright's WebKit is not Safari (BUGS.md 123), so the live chrome during a transition is checked here too.
		name: "pointer during transition",
		run: async (safari, site) => {
			for (const top of [0, 700]) {
				const problem = await pointerDuring(safari, site, top)
				if (problem !== undefined) return `${problem} (from scrollY ${top})`
			}
			return undefined
		},
	},
]

// Every flow, each reported as it ends. The exit code is the number of failed flows, capped at 1.
export async function runFlows(
	safari: SafariSession,
	site: Site,
	input: { log: (line: string) => void; flows?: readonly Flow[] },
): Promise<number> {
	const { log, flows = FLOWS } = input
	let failed = 0
	for (const flow of flows) {
		const problem = await flow.run(safari, site).then(
			async (found) => found ?? logged(await safari.js(PROBLEMS)),
			(error: unknown) => String(error),
		)
		if (problem !== undefined) failed += 1
		log(`${problem === undefined ? "PASS" : "FAIL"}  ${flow.name}${problem === undefined ? "" : `: ${problem}`}`)
	}
	log(`verify:safari: ${flows.length - failed} of ${flows.length} flows passed in Safari ${safari.version}`)
	return failed === 0 ? 0 : 1
}

// A page that logged something fails the flow that passed, with what it said.
function logged(problems: unknown): string | undefined {
	const lines = Array.isArray(problems) ? problems.map(String) : []
	return lines.length === 0 ? undefined : `the page logged ${lines.join("; ")}`
}

// The tunnel to the Mac's driver, ready once the driver answers `/status` as ready.
export async function tunnel(config: SafariConfig, fetch: Fetcher): Promise<{ base: string; close: () => void }> {
	const port = await freePort()
	const ssh: ChildProcess = spawn(
		"ssh",
		[
			"-N",
			"-o",
			"BatchMode=yes",
			"-o",
			"ExitOnForwardFailure=yes",
			"-L",
			`${port}:127.0.0.1:${config.driverPort}`,
			config.ssh,
		],
		{ stdio: ["ignore", "ignore", "pipe"] },
	)
	let stderr = ""
	ssh.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()))
	const base = `http://127.0.0.1:${port}`
	const close = (): void => void ssh.kill()
	for (let attempt = 0; attempt < 60 && ssh.exitCode === null; attempt += 1) {
		const ready = await fetch(`${base}/status`, { method: "GET" })
			.then(async (response) => Reflect.get(Object(Reflect.get(Object(await response.json()), "value")), "ready"))
			.catch(() => false)
		if (ready === true) return { base, close }
		await new Promise((resolve) => setTimeout(resolve, 250))
	}
	close()
	throw new Error(
		`The Mac's safaridriver is not reachable through \`ssh ${config.ssh}\` on port ${config.driverPort}${stderr === "" ? "" : ` (${stderr.trim()})`}. Run \`safaridriver -p ${config.driverPort}\` in a Terminal on the Mac.`,
	)
}

function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer()
		server.on("error", reject)
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address() as AddressInfo
			server.close(() => resolve(port))
		})
	})
}

// The docs server on every interface, so the Mac reaches it. Bodies stream through as they arrive. A browser that
// closes its request aborts the upstream one, and an upstream that breaks, as the server's own close does to a held
// stream, ends that one response instead of the run.
function expose(upstream: string): Promise<{ port: number; server: Server }> {
	const server = createServer((request, response) => {
		const chunks: Buffer[] = []
		const abort = new AbortController()
		response.on("close", () => abort.abort())
		request.on("data", (chunk: Buffer) => chunks.push(chunk))
		request.on("end", () => {
			const body =
				request.method === "GET" || request.method === "HEAD" ? undefined : Uint8Array.from(Buffer.concat(chunks))
			forward({ upstream, request, body, signal: abort.signal }, response).catch(() => response.destroy())
		})
	})
	return new Promise((resolve) =>
		server.listen(0, "0.0.0.0", () => resolve({ port: (server.address() as AddressInfo).port, server })),
	)
}

type Forwarded = {
	upstream: string
	request: IncomingMessage
	body: Uint8Array<ArrayBuffer> | undefined
	signal: AbortSignal
}

async function forward(input: Forwarded, response: ServerResponse): Promise<void> {
	const headers = Object.fromEntries(
		Object.entries(input.request.headers).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : [])),
	)
	const answer = await fetch(`${input.upstream}${input.request.url ?? "/"}`, {
		method: input.request.method,
		headers,
		body: input.body,
		redirect: "manual",
		signal: input.signal,
	})
	const out = Object.fromEntries(
		[...answer.headers].filter(([key]) => !["content-length", "content-encoding"].includes(key)),
	)
	response.writeHead(answer.status, out)
	const reader = answer.body?.getReader()
	for (let next = await reader?.read(); next !== undefined && !next.done; next = await reader?.read()) {
		response.write(next.value)
	}
	response.end()
}

// Runs a lock script on the Mac over ssh, its arguments quoted for the remote shell.
function sshRemote(destination: string): Remote {
	return (script, args) => {
		const command = ["sh", "-s", "--", ...args.map(quote)].join(" ")
		const run = spawnSync("ssh", ["-o", "BatchMode=yes", destination, command], { input: script, encoding: "utf8" })
		return { status: run.status, stdout: run.stdout ?? "" }
	}
}

// What a run drives inside the lock. It closes everything it opened when `signal` aborts, as the run's limit does.
export type Drive = (config: SafariConfig, signal: AbortSignal) => Promise<number>

export async function verifySafari(
	env: Record<string, string | undefined>,
	deps: { remote?: Remote; drive?: Drive; limitMs?: number } = {},
): Promise<number> {
	const config = configOf(env, () => spawnSync("tailscale", ["ip", "-4"], { encoding: "utf8" }).stdout ?? "")
	const remote = deps.remote ?? sshRemote(config.ssh)
	const limitMs = deps.limitMs ?? RUN_LIMIT_MS
	const path = env["FLARE_SAFARI_LOCK"] ?? "/tmp/flare-safari.lock"
	const lock: Lock = { path, owner: `${hostname()}:${process.pid}`, staleMs: limitMs }
	acquire(remote, lock, Date.now())
	const stop = new AbortController()
	let timer: ReturnType<typeof setTimeout> | undefined
	const limit = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			stop.abort()
			reject(new Error(`verify:safari ran past its limit of ${limitMs} ms`))
		}, limitMs)
	})
	try {
		return await Promise.race([(deps.drive ?? drive)(config, stop.signal), limit])
	} finally {
		clearTimeout(timer)
		release(remote, lock)
	}
}

// The tunnel, the docs server, and the flows, inside the lock.
async function drive(config: SafariConfig, signal: AbortSignal): Promise<number> {
	// Each resource as it opens, closed once: at the end, or at once when the limit aborts the run.
	const opened: (() => unknown)[] = []
	const closeAll = async (): Promise<void> => {
		for (const close of opened.splice(0).toReversed()) await Promise.resolve(close()).catch(() => undefined)
	}
	signal.addEventListener("abort", () => void closeAll(), { once: true })
	try {
		const driver = await tunnel(config, fetch)
		opened.push(driver.close)
		const docs = await boot({ app: "docs", runtime: "node", mode: "prod" })
		opened.push(docs.close)
		const exposed = await expose(docs.origin)
		opened.push(() => exposed.server.close())
		const upstream = docs.origin
		const site: Site = {
			origin: `http://${config.host}:${exposed.port}`,
			// A server function's input and its envelope's data are wire values (B145).
			callFn: async (id, data) =>
				envelopeOf(
					await (
						await fetch(`${upstream}/_flare/fn/${id}`, {
							method: "POST",
							headers: { origin: upstream, "content-type": "application/json" },
							body: JSON.stringify(wire(data)),
						})
					).json(),
				),
		}
		const safari = await SafariSession.open(driver.base, fetch)
		opened.push(() => safari.close())
		return await runFlows(safari, site, { log: (line) => console.log(line) })
	} finally {
		await closeAll()
	}
}

// The exit follows the verdict even when something the run opened is still holding the event loop.
if (import.meta.main) {
	const code = await verifySafari(process.env).catch((error: unknown) => {
		console.error(`verify:safari: ${error instanceof Error ? error.message : String(error)}`)
		return 1
	})
	process.exit(code)
}
