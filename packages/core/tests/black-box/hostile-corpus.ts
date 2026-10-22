// The hostile-request corpus (plan 21 17.1): raw HTTP/1.1 requests with the one answer each runtime gives, and the
// invariants every answer meets. A path with dot segments, encoded or not, is the path they name, as a URL parser reads
// it; an encoded slash, a `//` or `\\` start, and a Host that holds a path are 400; a malformed or NUL escape names no
// page; a page answers GET and HEAD, 204 to OPTIONS, and 405 to the rest; a server function answers only its own
// method, and its input decides a body it cannot read. docs-hostile sends it to every runtime's production server.

// The marker a request carries where an answer might reflect it: reflected unescaped, it would be markup on the page.
export const PROBE = "<flare-probe>"

export type Entry = {
	name: string
	method?: string
	path: string
	headers?: Readonly<Record<string, string>>
	body?: string
	// The status every runtime answers, unless `runtime` names another for one runtime, with its reason in a BUGS row.
	status: number
	runtime?: Readonly<Record<string, number>>
	// The answer's content-type class (typeClass), the same on every runtime.
	type: "html" | "json" | "ndjson" | "text" | "none"
}

// The raw request an entry sends to `host`: `Host` from the entry when it names one, the connection closed after.
export function request(entry: Entry, host: string): string {
	const headers = { Host: host, ...entry.headers, Connection: "close" }
	const lines = [
		`${entry.method ?? "GET"} ${entry.path} HTTP/1.1`,
		...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
	]
	return `${lines.join("\r\n")}\r\n\r\n${entry.body ?? ""}`
}

const ECHO_FN = "/_flare/fn/ECHO"

export const CORPUS: readonly Entry[] = [
	{ name: "home", type: "html", path: "/", status: 200 },
	{ name: "dot segments", type: "html", path: "/docs/../docs/routing", status: 200 },
	{ name: "encoded dot segments", type: "html", path: "/docs/%2e%2e/docs/routing", status: 200 },
	{ name: "encoded slash", type: "none", path: "/docs%2Frouting", status: 400 },
	{ name: "encoded slash lower", type: "none", path: "/docs%2frouting", status: 400 },
	{ name: "bad escape", type: "html", path: "/docs/%zz", status: 404 },
	{ name: "nul escape", type: "html", path: "/docs/%00", status: 404 },
	{ name: "double slash", type: "none", path: "//evil.example/", status: 400 },
	// A `//` start whose first segment is no host at all: a static layer that reads it as a URL must not throw (the
	// harness's Node server did, and stopped, found by the long form).
	{ name: "double slash, no host", type: "none", path: "//%C0%AE%C0%AE/", status: 400 },
	{ name: "backslash", type: "none", path: "/\\evil.example/", status: 400 },
	// workerd itself refuses a Host that holds a path: it throws stringifying the URL and answers 500 before the worker
	// runs. Cloudflare's edge validates Host first, so such a request never reaches a deployed worker (BUGS.md 487).
	{
		name: "host with path",
		type: "none",
		path: "/docs/routing",
		headers: { Host: "evil.example/admin?" },
		status: 400,
		runtime: { "workers-prod": 500 },
	},
	{ name: "foreign host", type: "html", path: "/docs/routing", headers: { Host: "evil.example" }, status: 200 },
	{ name: "post page", type: "none", method: "POST", path: "/docs/routing", status: 405 },
	{ name: "put page", type: "none", method: "PUT", path: "/docs/routing", status: 405 },
	{ name: "options page", type: "none", method: "OPTIONS", path: "/docs/routing", status: 204 },
	{ name: "head page", type: "html", method: "HEAD", path: "/docs/routing", status: 200 },
	{ name: "data twice", type: "ndjson", path: "/docs/routing?_flare=data&_flare=data", status: 200 },
	{ name: "unknown mode", type: "none", path: "/docs/routing?_flare=nope", status: 400 },
	{ name: "unknown fn", type: "none", path: "/_flare/fn/0000000000000000", status: 404 },
	{
		name: "fn empty body",
		type: "json",
		method: "POST",
		path: ECHO_FN,
		headers: { "Content-Type": "application/json", "Content-Length": "0" },
		status: 400,
	},
	{ name: "fn get", type: "none", path: ECHO_FN, status: 405 },
	{ name: "long path", type: "html", path: `/${"a".repeat(8000)}`, status: 404 },
	{
		name: "query injection",
		type: "html",
		path: "/docs/routing?next=https://evil.example&q=%0d%0aSet-Cookie:x=1",
		status: 200,
	},
	{ name: "probe in query", type: "html", path: `/docs/routing?q=${encodeURIComponent(PROBE)}`, status: 200 },
	{ name: "probe in path", type: "html", path: `/docs/${encodeURIComponent(PROBE)}`, status: 404 },
]

// The corpus with the echo server function's id in place of its placeholder.
export function withEcho(id: string): readonly Entry[] {
	return CORPUS.map((entry) => (entry.path === ECHO_FN ? { ...entry, path: `/_flare/fn/${id}` } : entry))
}

export type Answer = { status: number; head: string; body: string }

// The content-type class of an answer's head.
export function typeClass(head: string): "html" | "json" | "ndjson" | "text" | "none" {
	const type = /^content-type:\s*([^;\r\n]+)/im.exec(head)?.[1]?.trim().toLowerCase()
	if (type === undefined) return "none"
	if (type === "text/html") return "html"
	if (type === "application/x-ndjson") return "ndjson"
	if (type.endsWith("json")) return "json"
	return "text"
}

// What an answer must never show: a stack trace, a path on the machine that served it, the probe reflected unescaped,
// a header the request smuggled in, and in production a Server-Timing header. Each problem is one word or phrase.
export function invariantProblems(answer: Answer, at: { prod: boolean }): string[] {
	const problems: string[] = []
	if (/\n\s+at \S[^\n]*:\d+:\d+\)?/.test(answer.body)) problems.push("stack trace")
	if (/\/home\/|\/Users\/|[A-Za-z]:\\Users\\|node_modules\//.test(`${answer.head}\n${answer.body}`)) {
		problems.push("machine path")
	}
	if (answer.body.includes(PROBE)) problems.push("probe reflected")
	if (/^set-cookie:\s*x=1/im.test(answer.head)) problems.push("injected header")
	if (at.prod && /^server-timing:/im.test(answer.head)) problems.push("server-timing in prod")
	return problems
}
