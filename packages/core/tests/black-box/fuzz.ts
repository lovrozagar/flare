import type { Entry } from "./hostile-corpus.ts"
import { generator } from "./seeded.ts"

// The hostile suite's long form (plan 21 17.1): seeded mutations of the corpus, each one request with one thing
// changed, its method, its path, its Host, its Content-Length, a header sent twice, or a header too long. The long form
// holds them to the corpus's invariants, not to an expected status: no 5xx the corpus does not name, nothing leaked,
// and the server still answering. A mutation's name says its kind, what it changed, and the entry it came from.

const METHODS = ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "TRACE", "CONNECT", "PROPFIND", "get"]
const PATH_EDITS: ReadonlyArray<(path: string) => string> = [
	(path) => `${path}/..`,
	(path) => `${path}/%2e%2e%2f`,
	(path) => `${path}%00`,
	(path) => `${path}%`,
	(path) => `${path}?${"q=1&".repeat(500)}`,
	(path) => `${path}#frag`,
	(path) => `/${path.slice(1).toUpperCase()}`,
	(path) => `${path}/%C0%AE%C0%AE/`,
	(path) => `${path};param`,
	(path) => `/./${path.slice(1)}`,
	(path) => `${path}?_flare=data&_flare=prefetch`,
	(path) => `${path}/${"x".repeat(2000)}`,
]
const HOSTS = ["", "evil.example", "127.0.0.1:1", "[::1]", "a b", "localhost:99999", "xn--ls8h.example", "host.\u0000"]
const LENGTHS = ["0", "5", "-1", "99999999999", "abc", "1, 1"]

// The mutations workerd answers itself, before Flare's worker runs, which Cloudflare's edge refuses before they reach
// a deployed worker: a Host it cannot parse (500, BUGS.md 487), an invalid Content-Length (500), CONNECT, which needs a
// `connect()` handler (500), and a lowercase method (501).
export const WORKERD_OWN = /^host: |^content-length: (-1|abc|1, 1) |^method: (CONNECT|[a-z]+) /

export function mutations(corpus: readonly Entry[], at: { seed: number; count: number }): Entry[] {
	const draw = generator(at.seed)
	const pick = <T>(list: readonly T[]): T => list[Math.floor(draw() * list.length)] as T
	const made: Entry[] = []
	for (let index = 0; index < at.count; index++) {
		const base = pick(corpus)
		const kind = pick(["method", "path", "host", "content-length", "repeated-header", "long-header"] as const)
		const from = `from ${base.name}`
		const headers = { ...base.headers }
		let entry: Entry
		if (kind === "method") {
			const method = pick(METHODS)
			entry = { ...base, method, name: `method: ${method} ${from}` }
		} else if (kind === "path") {
			const edit = Math.floor(draw() * PATH_EDITS.length)
			const path = (PATH_EDITS[edit] ?? ((same: string) => same))(base.path)
			entry = { ...base, path, name: `path: edit ${edit} ${from}` }
		} else if (kind === "host") {
			const host = pick(HOSTS)
			entry = { ...base, headers: { ...headers, Host: host }, name: `host: ${JSON.stringify(host)} ${from}` }
		} else if (kind === "content-length") {
			const length = pick(LENGTHS)
			entry = {
				...base,
				method: base.method ?? "POST",
				headers: { ...headers, "Content-Length": length },
				body: "{}",
				name: `content-length: ${length} ${from}`,
			}
		} else if (kind === "repeated-header") {
			entry = {
				...base,
				headers: { ...headers, Accept: "text/html\r\nAccept: application/x-ndjson" },
				name: `repeated-header: Accept ${from}`,
			}
		} else {
			entry = { ...base, headers: { ...headers, "X-Long": "v".repeat(16_000) }, name: `long-header: 16000 ${from}` }
		}
		made.push(entry)
	}
	return made
}
