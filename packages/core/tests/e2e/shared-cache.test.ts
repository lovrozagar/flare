import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest"
import { sharedCache, type SharedCache } from "./shared-cache.ts"

// The shared cache cache-sharing.test.ts puts in front of each production runtime: RFC 9111's shared-cache rules and
// RFC 9213's CDN-Cache-Control, each at the permissive edge the RFC allows, so a pass there means no compliant cache
// leaks (plan 28).

type Answer = { status?: number; headers?: Record<string, string | string[]>; body?: string }

let origin: Server
let base = ""
let answers: Record<string, Answer> = {}
let hits: Record<string, number> = {}
let cache: SharedCache

function answer(request: IncomingMessage, response: ServerResponse): void {
	const path = request.url ?? "/"
	hits[path] = (hits[path] ?? 0) + 1
	const {
		status = 200,
		headers = {},
		body = `body of ${path} #${hits[path]}`,
	} = answers[path.split("?")[0] ?? ""] ?? {}
	for (const [name, value] of Object.entries(headers)) response.setHeader(name, value)
	response.writeHead(status)
	response.end(request.method === "HEAD" ? undefined : body)
}

beforeAll(async () => {
	origin = createServer(answer)
	await new Promise<void>((resolve) => origin.listen(0, "127.0.0.1", resolve))
	base = `http://127.0.0.1:${(origin.address() as AddressInfo).port}`
})

afterAll(async () => {
	await new Promise((resolve) => origin.close(resolve))
})

beforeEach(async () => {
	await cache?.close()
	answers = {}
	hits = {}
	cache = await sharedCache(base)
})

const twice = async (
	path: string,
	second: RequestInit = {},
	first: RequestInit = {},
): Promise<[Response, Response]> => [
	await fetch(`${cache.origin}${path}`, first),
	await fetch(`${cache.origin}${path}`, second),
]

it("stores public s-maxage", async () => {
	answers["/p"] = { headers: { "cache-control": "public, max-age=0, s-maxage=60" } }
	const [first, second] = await twice("/p")
	expect([await first.text(), await second.text()]).toEqual(["body of /p #1", "body of /p #1"])
	expect(second.headers.get("age")).toMatch(/^\d+$/)
	expect(cache.decisions.map((entry) => [entry.url, entry.stored])).toEqual([["/p", true]])
})

it("never stores private or no-store", async () => {
	answers["/private"] = { headers: { "cache-control": "private, max-age=60" } }
	answers["/none"] = { headers: { "cache-control": "no-store" } }
	for (const path of ["/private", "/none"]) {
		const [first, second] = await twice(path)
		expect([await first.text(), await second.text()]).toEqual([`body of ${path} #1`, `body of ${path} #2`])
	}
	expect(cache.decisions.every((entry) => !entry.stored)).toBe(true)
})

// Heuristic freshness: a 200 with no Cache-Control and no Expires is stored, as RFC 9111 4.2.2 allows.
it("heuristic", async () => {
	answers["/plain"] = {}
	answers["/missing"] = { status: 404 }
	answers["/created"] = { status: 201 }
	for (const [path, kept] of [
		["/plain", true],
		["/missing", true],
		["/created", false],
	] as const) {
		const [first, second] = await twice(path)
		expect((await second.text()) === (await first.text())).toBe(kept)
	}
	expect(cache.decisions.map((entry) => [entry.url, entry.stored, entry.freshness])).toEqual([
		["/plain", true, "heuristic"],
		["/missing", true, "heuristic"],
		["/created", false, "none"],
		["/created", false, "none"],
	])
})

// A stored answer's Set-Cookie is replayed to the next request, which RFC 9111 permits unless the answer forbids it.
it("replays set-cookie", async () => {
	answers["/cookie"] = {
		headers: { "set-cookie": ["a=1; Path=/", "b=2; Path=/"], "cache-control": "public, max-age=60" },
	}
	answers["/field"] = { headers: { "set-cookie": "c=3", "cache-control": 'public, max-age=60, no-cache="set-cookie"' } }
	const [, again] = await twice("/cookie")
	expect(again.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"])
	const [, field] = await twice("/field")
	expect([await field.text(), field.headers.getSetCookie()]).toEqual(["body of /field #1", []])
	expect(cache.decisions.map((entry) => [entry.url, entry.setCookie])).toEqual([
		["/cookie", true],
		["/field", true],
	])
})

it("keys by vary", async () => {
	answers["/vary"] = { headers: { "cache-control": "public, max-age=60", vary: "Accept-Language" } }
	answers["/star"] = { headers: { "cache-control": "public, max-age=60", vary: "*" } }
	const en = { headers: { "accept-language": "en" } }
	const hr = { headers: { "accept-language": "hr" } }
	const [first, other] = await twice("/vary", hr, en)
	expect([await first.text(), await other.text()]).toEqual(["body of /vary #1", "body of /vary #2"])
	expect(await (await fetch(`${cache.origin}/vary`, en)).text()).toBe("body of /vary #1")
	const [star, starAgain] = await twice("/star")
	expect(await starAgain.text()).not.toBe(await star.text())
})

// RFC 9213: a CDN reads CDN-Cache-Control and ignores Cache-Control when both are present.
it("cdn cache control", async () => {
	answers["/cdn"] = { headers: { "cache-control": "no-store", "cdn-cache-control": "public, max-age=60" } }
	answers["/cdn-off"] = { headers: { "cache-control": "public, max-age=60", "cdn-cache-control": "no-store" } }
	const [cdn, cdnAgain] = await twice("/cdn")
	expect(await cdnAgain.text()).toBe(await cdn.text())
	const [off, offAgain] = await twice("/cdn-off")
	expect(await offAgain.text()).not.toBe(await off.text())
})

// A request with Authorization reuses a stored answer only when the answer says public or s-maxage (RFC 9111 3.5).
it("authorization", async () => {
	answers["/auth"] = { headers: { "cache-control": "max-age=60" } }
	answers["/auth-public"] = { headers: { "cache-control": "public, max-age=60" } }
	const authorized = { headers: { authorization: "Bearer x" } }
	const [auth, authAgain] = await twice("/auth", authorized, authorized)
	expect(await authAgain.text()).not.toBe(await auth.text())
	const [open, openAgain] = await twice("/auth-public", authorized, authorized)
	expect(await openAgain.text()).toBe(await open.text())
})

it("head from get", async () => {
	answers["/h"] = { headers: { "cache-control": "public, max-age=60", "x-mark": "kept" } }
	await fetch(`${cache.origin}/h`)
	const head = await fetch(`${cache.origin}/h`, { method: "HEAD" })
	expect([head.status, head.headers.get("x-mark"), hits["/h"]]).toEqual([200, "kept", 1])
})

// Only GET and HEAD are stored; a POST passes through and is recorded as not stored.
it("post passes", async () => {
	answers["/form"] = { headers: { "cache-control": "public, max-age=60" } }
	const post = { method: "POST", body: "x" }
	const [first, second] = await twice("/form", post, post)
	expect(await second.text()).not.toBe(await first.text())
	expect(cache.decisions.map((entry) => [entry.method, entry.stored])).toEqual([
		["POST", false],
		["POST", false],
	])
})

// A redirect passes through unfollowed, with its Location, so a browser behind the cache sees what it would see direct.
it("redirect", async () => {
	answers["/old"] = { status: 302, headers: { location: "/new" } }
	const moved = await fetch(`${cache.origin}/old`, { redirect: "manual" })
	expect([moved.status, moved.headers.get("location")]).toEqual([302, "/new"])
})
