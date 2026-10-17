import { boot, type Boot } from "./boot.ts"
import { expect, fnId, serverOf, test, wire } from "./docs.fixture.ts"
import type { HttpClient } from "./http.ts"

// The cross-runtime parity run (plan 21 17.1): one list of ordinary requests, documents, data and prefetch answers, a
// not-found, HEAD and OPTIONS, a respelled and a slashed path, a text route, and server-function calls, sent to the
// Node, Bun, and workerd production servers of one build each. Every runtime gives each request the same answer: its
// status, the headers an app or a cache acts on, and its body, with the values that differ per request masked.

const ECHO = fnId("src/fns/echo.ts", "echo")

type Ask = { method?: string; path: string; headers?: Record<string, string>; body?: string }

const ASKS: Ask[] = [
	{ path: "/" },
	{ path: "/docs/routing" },
	{ path: "/docs/routing?_flare=data" },
	{ path: "/docs/routing?_flare=prefetch" },
	{ path: "/missing" },
	{ path: "/missing?_flare=data" },
	{ method: "HEAD", path: "/docs/routing" },
	{ method: "OPTIONS", path: "/docs/routing" },
	{ path: "/llms.txt" },
	{ path: "/docs/Routing" },
	{ path: "/docs/routing/" },
	{ path: "/search?q=route" },
	{ method: "POST", path: `/_flare/fn/${ECHO}`, headers: { "content-type": "application/json" }, body: "" },
	{ method: "POST", path: `/_flare/fn/${ECHO}`, headers: { origin: "https://evil.example" }, body: "{}" },
	{ path: `/_flare/fn/${ECHO}` },
	{ path: "/_flare/fn/0000000000000000" },
]

// The headers a client, an app, or a cache acts on. The date, the server's own, and the connection's are not.
const HEADERS = [
	"allow",
	"cache-control",
	"cache-tag",
	"cdn-cache-control",
	"content-type",
	"flare-cache",
	"flare-render",
	"location",
	"vary",
	"x-content-type-options",
	"x-frame-options",
	"content-security-policy",
	"referrer-policy",
	"permissions-policy",
]

// A nonce, a render time, a query's fetch time, and a build id are the request's or the build's own (the Workers
// build is another build), and the docs app's serverContext gives each request an eight-hex id and names its runtime.
function masked(text: string): string {
	return text
		.replaceAll(/[0-9a-f]{32}/g, "<nonce>")
		.replaceAll(/"build":"[0-9a-f]+"/g, '"build":"<build>"')
		.replaceAll(/\b1\d{12}\b/g, "<time>")
		.replaceAll(/\b[0-9a-f]{8}\b/g, "<id>")
		.replaceAll(/\b(?:node|bun|workers)\b/g, "<runtime>")
		.replaceAll(/"at":\d+/g, '"at":<at>')
		.replaceAll(/flare-build[^,;]*/g, "flare-build")
}

// Where two answers part: the character, and the text around it on both sides.
function firstDifference(left: string, right: string): string {
	let at = 0
	while (at < left.length && left[at] === right[at]) at++
	const around = (text: string) => JSON.stringify(text.slice(Math.max(0, at - 60), at + 60))
	return `part at ${at}: ${around(left)} vs ${around(right)}`
}

// One ask through the spec's own client, a connection per call (BUGS.md 125): the CSRF refusal answers before it reads
// the body, and local Miniflare resets a kept-alive socket that does so (BUGS.md 56). Redirects are not followed.
async function answer(http: HttpClient, origin: string, ask: Ask): Promise<string> {
	const headers = { origin, ...ask.headers }
	const data = ask.body === undefined ? undefined : ask.body === "" ? wire({ text: "hi" }) : JSON.parse(ask.body)
	const response = await http.request(ask.method ?? "GET", `${origin}${ask.path}`, { headers, data, maxRedirects: 0 })
	const kept = HEADERS.map((name) => `${name}: ${response.headers()[name] ?? "-"}`)
	return masked([`${response.status()}`, ...kept, await response.text()].join("\n"))
}

test("runtime parity", async ({ docs, http }, info) => {
	test.skip(serverOf(info) !== "node-prod" || info.project.name.split("-")[2] !== "chromium", "one run")
	test.setTimeout(600_000)
	const others: Boot[] = []
	try {
		for (const runtime of ["bun", "workers"]) others.push(await boot({ app: "docs", runtime, mode: "prod" }))
		const servers = [docs, ...others]
		const answers = await Promise.all(
			servers.map(async (server) => {
				const seen: string[] = []
				for (const ask of ASKS) seen.push(await answer(http, server.origin, ask))
				return seen.map((text) => text.replaceAll(server.origin, "<origin>"))
			}),
		)
		const [node, bun, workers] = answers
		const differs = ASKS.flatMap((ask, index) => {
			const line = `${ask.method ?? "GET"} ${ask.path}`
			const n = node?.[index] ?? ""
			return [
				["bun", bun?.[index] ?? ""],
				["workers", workers?.[index] ?? ""],
			].flatMap(([name, other]) =>
				other === n ? [] : [`${line}: node and ${name} ${firstDifference(n, String(other))}`],
			)
		})
		expect(differs).toEqual([])
	} finally {
		for (const server of others) await server.close()
	}
})
