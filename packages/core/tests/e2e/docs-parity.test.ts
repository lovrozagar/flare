import { mutations } from "../black-box/fuzz.ts"
import { type Entry, request, withEcho } from "../black-box/hostile-corpus.ts"
import { header, raw } from "../black-box/raw.ts"
import { replayLine, runFrom } from "../black-box/seeded.ts"
import { boot, type Boot } from "./boot.ts"
import { PAGES } from "./docs-pages.ts"
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
// seroval's helpers, which it writes as its own functions' source text (`$R[3]=() => {…}`, `$R[7]=(resolver, data) =>
// {…}`): Bun reprints a module it loads and the Workers bundle is minified, so the same helper reads three ways. Each
// body is masked to its closing brace.
const HELPER = /\$R\[\d+\]=\((?:\w+(?:,\s*\w+)*)?\)\s*=>\s*\{/g

function maskedHelpers(text: string): string {
	let out = ""
	let from = 0
	for (const match of text.matchAll(HELPER)) {
		if (match.index < from) continue
		let depth = 0
		let end = match.index + match[0].length - 1
		do {
			if (text[end] === "{") depth++
			else if (text[end] === "}") depth--
			end++
		} while (depth > 0 && end < text.length)
		out += `${text.slice(from, match.index)}$R[<n>]=<helper>`
		from = end
	}
	return out + text.slice(from)
}

function masked(text: string): string {
	return maskedHelpers(text)
		.replaceAll(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, "<date>")
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

// One corpus request, raw, as parity compares it: status, the same headers, and the masked body.
async function rawAnswer(origin: string, text: string): Promise<string> {
	const answer = await raw(origin, text).catch((error: unknown) => ({ status: 0, head: "", body: String(error) }))
	const kept = HEADERS.map((name) => `${name}: ${header(answer.head, name) ?? "-"}`)
	return masked([`${answer.status}`, ...kept, answer.body].join("\n"))
}

// The hostile corpus's requests whose answer is the same on every runtime: a request with a runtime's own answer, such
// as workerd's refusal of a Host that holds a path, is the hostile suite's, not parity's.
const CORPUS_ASKS = withEcho(ECHO).filter((entry) => entry.runtime === undefined)

// A named request, and how one server answers it as parity compares it.
type Probe = { line: string; answer: (server: Boot) => Promise<string> }

// Every probe against Node (the fixture's server), Bun, and workerd, each production server of its own build; a probe
// whose answer differs anywhere is one line naming where.
async function compareAcross(docs: Boot, probes: readonly Probe[]): Promise<string[]> {
	const others: Boot[] = []
	try {
		for (const runtime of ["bun", "workers"]) others.push(await boot({ app: "docs", runtime, mode: "prod" }))
		const answers = await Promise.all(
			[docs, ...others].map(async (server) => {
				const seen: string[] = []
				for (const probe of probes) seen.push((await probe.answer(server)).replaceAll(server.origin, "<origin>"))
				return seen
			}),
		)
		const [node, bun, workers] = answers
		return probes.flatMap((probe, index) => {
			const n = node?.[index] ?? ""
			return [
				["bun", bun?.[index] ?? ""],
				["workers", workers?.[index] ?? ""],
			].flatMap(([name, other]) =>
				other === n ? [] : [`${probe.line}: node and ${name} ${firstDifference(n, String(other))}`],
			)
		})
	} finally {
		for (const server of others) await server.close()
	}
}

function corpusProbe(entry: Entry): Probe {
	return {
		line: `corpus ${entry.name}`,
		answer: (server) => rawAnswer(server.origin, request(entry, new URL(server.origin).host)),
	}
}

test("runtime parity", async ({ docs, http }, info) => {
	test.skip(serverOf(info) !== "node-prod" || info.project.name.split("-")[2] !== "chromium", "one run")
	test.setTimeout(600_000)
	const probes: Probe[] = [
		...ASKS.map((ask) => ({
			line: `${ask.method ?? "GET"} ${ask.path}`,
			answer: (server: Boot) => answer(http, server.origin, ask),
		})),
		...CORPUS_ASKS.map(corpusProbe),
	]
	expect(await compareAcross(docs, probes)).toEqual([])
})

// The long form (plan 21 17.1, the nightly): every docs page, its document and its data request, and seeded fuzz
// requests from the corpus that each runtime's HTTP parser hands to the app alike. The rest are the parser's own
// answer: a Host workerd cannot parse (BUGS.md 487), a Content-Length that is invalid or leaves the body on the wire as
// a second request, a 16 KB header (Node's limit, 431), a lowercase method, and CONNECT (Node's own event, dx/adapters.md).
const PARSER_OWN = /^(host|content-length|long-header): |^method: (CONNECT|[a-z]+) /
const LONG = runFrom(process.env, { name: "PARITY", seed: 20_261_022, steps: 0, longSteps: 300 })

test("runtime parity long", async ({ docs, http }, info) => {
	test.skip(LONG.steps === 0, "the nightly's long form (FLARE_BLACKBOX_LONG=1 or FLARE_PARITY_STEPS)")
	test.skip(serverOf(info) !== "node-prod" || info.project.name.split("-")[2] !== "chromium", "one run")
	test.setTimeout(20 * 60_000)
	const replay = replayLine(LONG, {
		name: "PARITY",
		command: `bun run test:e2e -- --project ${info.project.name} docs-parity -g "runtime parity long"`,
	})
	const pages = PAGES.flatMap((page): Probe[] =>
		[page.path, `${page.path}${page.path.includes("?") ? "&" : "?"}_flare=data`].map((path) => ({
			line: `page ${path}`,
			answer: (server: Boot) => answer(http, server.origin, { path }),
		})),
	)
	const fuzz = mutations(CORPUS_ASKS, { seed: LONG.seed, count: LONG.steps })
		.filter((entry) => !PARSER_OWN.test(entry.name))
		.map(corpusProbe)
	expect(await compareAcross(docs, [...pages, ...fuzz]), replay).toEqual([])
})
