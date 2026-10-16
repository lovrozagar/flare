import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import type { Browser } from "@playwright/test"

// Does warming another app's module from a landing page let that app reuse it (plan 17, BUGS.md 124)? One server answers
// every host by its Host header: the landing page, an app under /app/ on the same origin, an app on a same-site
// subdomain, and an app on another site. Each trial asks for its own module URL, so no two trials share a cache entry,
// and the server counts each module's downloads: after the warm step, and after the app ran it.

export const METHODS = ["none", "prefetch", "fetch", "modulepreload"] as const
export type Method = (typeof METHODS)[number]

// Where the warmed app lives, relative to the landing page.
export type Topology = { name: "same-origin /app" | "subdomain" | "cross-site"; host: string; base: string }

// `site` hosts the landing page and the /app app; `app.<site>` is the subdomain; `other` is another site. The defaults
// are `*.localhost`, which Chrome and Firefox resolve to the loopback themselves (FLARE_REUSE_SITE, FLARE_REUSE_OTHER).
export function topologies(env: Record<string, string | undefined>, port: number): Topology[] {
	const site = env["FLARE_REUSE_SITE"] ?? "reuse.localhost"
	const other = env["FLARE_REUSE_OTHER"] ?? "other.localhost"
	return [
		{ name: "same-origin /app", host: `${site}:${port}`, base: "/app/" },
		{ name: "subdomain", host: `app.${site}:${port}`, base: "/" },
		{ name: "cross-site", host: `${other}:${port}`, base: "/" },
	]
}

// What one trial saw: downloads after the warm step and in all. `ignored`: the warm step fetched nothing; `reused`:
// the app's load fetched nothing more; `refetched`: it fetched again.
export type Trial = { topology: Topology["name"]; method: Method; warmed: number; total: number; verdict: string }

export function verdictOf(method: Method, warmed: number, total: number): string {
	if (method === "none") return `baseline ${total}`
	if (warmed === 0) return "ignored"
	return total === warmed ? "reused" : "refetched"
}

const LANDING = (method: Method, target: string): string => `<!doctype html><meta charset=utf-8><title>landing</title>
<script>
const method = ${JSON.stringify(method)}, target = ${JSON.stringify(target)};
const done = () => { window.__warmed = true };
if (method === "prefetch" || method === "modulepreload") {
	const link = document.createElement("link");
	link.rel = method;
	if (method === "prefetch") link.as = "script";
	link.crossOrigin = "anonymous";
	link.href = target;
	link.onload = done;
	link.onerror = done;
	document.head.append(link);
	setTimeout(done, 3000);
} else if (method === "fetch") {
	fetch(target, { mode: "cors" }).then((response) => response.arrayBuffer()).then(done, done);
} else done();
</script>`

const APP = (module: string): string =>
	`<!doctype html><meta charset=utf-8><title>app</title><script type="module" crossorigin src="${module}"></script>`

// The server, on the loopback at a free port. Module responses are immutable and CORS-open, as hashed assets are.
export async function reuseServer(): Promise<{ port: number; count: (path: string) => number; close: () => void }> {
	const hits = new Map<string, number>()
	const server: Server = createServer((request, response) => {
		const host = request.headers.host ?? ""
		const url = new URL(request.url ?? "/", `http://${host}`)
		const path = `${url.hostname}${url.pathname}`
		if (url.pathname.endsWith(".js")) {
			hits.set(path, (hits.get(path) ?? 0) + 1)
			response.writeHead(200, {
				"content-type": "text/javascript",
				"cache-control": "public, max-age=31536000, immutable",
				"access-control-allow-origin": "*",
			})
			response.end("window.__ran = (window.__ran ?? 0) + 1;\n")
			return
		}
		response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" })
		if (url.pathname === "/landing") {
			const method = (url.searchParams.get("method") ?? "none") as Method
			response.end(LANDING(method, url.searchParams.get("target") ?? ""))
			return
		}
		response.end(APP(url.searchParams.get("m") ?? "/none.js"))
	})
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
	const { port } = server.address() as AddressInfo
	return { port, count: (path) => hits.get(path) ?? 0, close: () => server.close() }
}

// Every method against one topology, each in a fresh context, so nothing is cached between trials. `landing` is the
// landing page's host (the same-origin topology's).
export async function measure(
	browser: Browser,
	input: { landing: string; topology: Topology; count: (path: string) => number; tag: string },
): Promise<Trial[]> {
	const trials: Trial[] = []
	for (const method of METHODS) {
		const file = `${input.topology.base}m-${input.tag}-${method}.js`
		const module = `http://${input.topology.host}${file}`
		const path = `${input.topology.host.replace(/:\d+$/, "")}${file}`
		const context = await browser.newContext()
		const page = await context.newPage()
		try {
			await page.goto(`http://${input.landing}/landing?method=${method}&target=${encodeURIComponent(module)}`)
			await page.waitForFunction(() => Reflect.get(window, "__warmed") === true, null, { timeout: 10_000 })
			// The warm request lands on the server a little after the link's load event in some engines.
			await page.waitForTimeout(500)
			const warmed = input.count(path)
			await page.goto(`http://${input.topology.host}${input.topology.base}?m=${encodeURIComponent(file)}`)
			await page.waitForFunction(() => Reflect.get(window, "__ran") === 1, null, { timeout: 10_000 })
			const total = input.count(path)
			trials.push({ topology: input.topology.name, method, warmed, total, verdict: verdictOf(method, warmed, total) })
		} finally {
			await context.close()
		}
	}
	return trials
}
