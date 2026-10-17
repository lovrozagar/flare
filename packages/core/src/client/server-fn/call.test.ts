import { expect, it, vi } from "vitest"
import { dataToWire, toWire } from "../../shared/protocol/value.ts"
import { callServerFn, createServerFn, ServerFnError, type CallDeps } from "./call.ts"

const echo = { id: "0123456789abcdef", name: "echo", record: { method: "post" as const } }

type Answer = { body: BodyInit | null; status?: number; headers?: Record<string, string> }

// An envelope's data is a wire value (B145); the envelope around it is JSON.
function json(value: unknown, status = 200, headers: Record<string, string> = {}): Answer {
	const body = typeof value === "object" && value !== null ? dataToWire(value) : value
	return { body: JSON.stringify(body), status, headers: { "content-type": "application/json", ...headers } }
}

function deps(answer: Answer, extra: Partial<CallDeps> = {}) {
	const fetch = vi.fn<CallDeps["fetch"]>(
		async () => new Response(answer.body, { status: answer.status ?? 200, headers: answer.headers ?? {} }),
	)
	const go = vi.fn<CallDeps["go"]>()
	const assign = vi.fn<CallDeps["assign"]>()
	const reload = vi.fn<CallDeps["reload"]>(() => true)
	const base: CallDeps = {
		fetch,
		go,
		assign,
		reload,
		origin: "http://localhost",
		basePath: "/",
		build: "b1",
		href: () => "http://localhost/page",
		forget: () => undefined,
	}
	return { ...base, ...extra, fetch, go, assign, reload }
}

async function rejection(promise: Promise<unknown>): Promise<ServerFnError> {
	const error: unknown = await promise.then(
		() => undefined,
		(caught: unknown) => caught,
	)
	if (!(error instanceof ServerFnError)) throw new Error("did not reject with a ServerFnError")
	return error
}

it("posts", async () => {
	const call = deps(json({ name: "echo", status: 200, data: { n: 1 } }))
	expect(await callServerFn(echo, { a: 1 }, call)).toEqual({ n: 1 })
	const [url, init] = call.fetch.mock.calls[0]
	expect(url).toBe("/_flare/fn/0123456789abcdef")
	expect(init.method).toBe("POST")
	expect(init.body).toBe(JSON.stringify(toWire({ a: 1 })))
})

it("reject", async () => {
	const production = await rejection(
		callServerFn(
			echo,
			1,
			deps(json({ name: "echo", status: 500, message: "Something went wrong", digest: "abc" }, 500)),
		),
	)
	expect(production).toBeInstanceOf(Error)
	expect(production).toMatchObject({ message: "Something went wrong", status: 500, digest: "abc" })
	const dev = await rejection(
		callServerFn(
			echo,
			1,
			deps(json({ name: "echo", status: 500, message: "boom", stack: "Error: boom\n    at x" }, 500)),
		),
	)
	expect(dev.stack).toBe("Error: boom\n    at x")
	expect(dev.digest).toBeUndefined()
	const errors = { issues: [{ message: "bad", path: ["n"] }], fieldErrors: { n: ["bad"] } }
	const invalid = await rejection(
		callServerFn(echo, 1, deps(json({ name: "echo", status: 400, message: "Invalid input", errors }, 400))),
	)
	expect(invalid).toMatchObject({ status: 400, ...errors })
	// A same-origin redirect is the internal URL navigation, and the promise still rejects.
	const redirect = { to: "/login?next=a#top", status: 303, replace: true }
	const inside = deps(json({ name: "echo", status: 303, redirect }))
	expect(await rejection(callServerFn(echo, 1, inside))).toMatchObject({ status: 303, redirect })
	expect(inside.go).toHaveBeenCalledExactlyOnceWith("/login?next=a#top", true)
	expect(inside.assign).not.toHaveBeenCalled()
	const away = { to: "https://example.com/a", status: 303, replace: false }
	const outside = deps(json({ name: "echo", status: 303, redirect: away }))
	await rejection(callServerFn(echo, 1, outside))
	expect(outside.assign).toHaveBeenCalledExactlyOnceWith("https://example.com/a")
	expect(outside.go).not.toHaveBeenCalled()
	// A bare status has no envelope.
	expect(await rejection(callServerFn(echo, 1, deps({ body: null, status: 405 })))).toMatchObject({
		message: "HTTP 405",
		status: 405,
	})
	expect(await rejection(callServerFn(echo, 1, deps(json([1], 500))))).toMatchObject({ message: "HTTP 500" })
})

// The server marks a returned Response. The call resolves with it untouched, whatever its status.
async function returned(answer: Answer): Promise<Response> {
	const marked = { ...answer, headers: { ...answer.headers, "flare-fn": "response" } }
	const value = await callServerFn(echo, 1, deps(marked))
	if (!(value instanceof Response)) throw new Error("did not resolve with the Response")
	return value
}

it("returned response", async () => {
	const teapot = await returned({ body: "x", status: 418 })
	expect(teapot.status).toBe(418)
	expect(await teapot.text()).toBe("x")
	// Unmarked, the same answer is a bare framework status.
	expect(await rejection(callServerFn(echo, 1, deps({ body: "x", status: 418 })))).toMatchObject({ status: 418 })
})

it("json response", async () => {
	const listed = await returned(json({ status: 200, items: [1] }))
	expect(listed.bodyUsed).toBe(false)
	expect(await listed.json()).toEqual({ status: 200, items: [1] })
})

it("untrusted envelope", async () => {
	// A malformed issue keeps what it can, and anything else is dropped.
	const loose = { issues: [{ message: "bad", path: ["n"] }, { path: ["x"] }, { message: "loose", path: "n" }] }
	const kept = await rejection(callServerFn(echo, 1, deps(json({ status: 400, errors: loose }, 400))))
	expect(kept).toMatchObject({
		issues: [
			{ message: "bad", path: ["n"] },
			{ message: "loose", path: [] },
		],
		fieldErrors: { n: ["bad"] },
	})
	const none = await rejection(callServerFn(echo, 1, deps(json({ status: 400, errors: { issues: "x" } }, 400))))
	expect(none).toMatchObject({ issues: [], fieldErrors: {} })
	expect(await rejection(callServerFn(echo, 1, deps(json({ message: "no status" }, 502))))).toMatchObject({
		message: "HTTP 502",
	})
})

it("build mismatch", async () => {
	const stale = deps(json({ name: "echo", status: 200, data: 1 }, 200, { "flare-build": "b2" }))
	expect(await rejection(callServerFn(echo, 1, stale))).toMatchObject({ status: 200 })
	expect(stale.reload).toHaveBeenCalledExactlyOnceWith("http://localhost/page")
	const missing = deps(json({ name: "echo", status: 200, data: 1 }))
	expect(await callServerFn(echo, 1, missing)).toBe(1)
	const unbuilt = deps(json({ name: "echo", status: 200, data: 2 }, 200, { "flare-build": "b2" }), { build: "" })
	expect(await callServerFn(echo, 1, unbuilt)).toBe(2)
	expect(missing.reload).not.toHaveBeenCalled()
	expect(unbuilt.reload).not.toHaveBeenCalled()
})

// The client entry's callable reads the booted transport, `self.flare.call`, when it is called (dx/server-fn.md).
it("before boot", () => {
	Reflect.deleteProperty(globalThis, "flare")
	const ping = createServerFn().handler(() => "never")
	expect(() => ping()).toThrow("server function called before the client booted")
})

it("booted", async () => {
	const call = vi.fn<(fn: unknown, input: unknown) => Promise<string>>(async () => "pong")
	Reflect.set(globalThis, "flare", { build: "b1", call })
	try {
		const ping = createServerFn()
			.input((value: unknown) => value)
			.handler(() => "never")
		expect(await ping("x")).toBe("pong")
		expect(call).toHaveBeenCalledExactlyOnceWith(ping, "x")
	} finally {
		Reflect.deleteProperty(globalThis, "flare")
	}
})

// A server function whose handler wrote a cookie answers with `flare-cookies: set`, and the client forgets what it held
// before the call resolves. An answer without it, or with another value, forgets nothing (B133).
it("cookie signal", async () => {
	const order: string[] = []
	const forget = vi.fn<CallDeps["forget"]>(() => void order.push("forget"))
	const answer = (headers: Record<string, string>) => deps(json({ status: 200, data: 1 }, 200, headers), { forget })
	await callServerFn(echo, null, answer({ "flare-cookies": "set" })).then(() => order.push("resolved"))
	expect(order).toEqual(["forget", "resolved"])
	await callServerFn(echo, null, answer({}))
	await callServerFn(echo, null, answer({ "flare-cookies": "kept" }))
	expect(forget).toHaveBeenCalledOnce()
})

// A cached GET answer, in the browser or a CDN, is keyed on the URL. The URL carries the client's build, so after a
// deploy the new client never reads the answer the previous build cached: it gets the new build's, with no reload
// (plan 21 8.5, BUGS.md 199).
it("cached across a deploy", async () => {
	const read = { id: "0123456789abcdef", name: "read", record: { method: "get" as const } }
	const cache = new Map<string, Response>()
	let live = "b1"
	const fetch = async (url: string): Promise<Response> => {
		const hit = cache.get(url)
		if (hit !== undefined) return hit.clone()
		const fresh = new Response(JSON.stringify(dataToWire({ status: 200, data: live })), {
			headers: { "content-type": "application/json", "flare-build": live },
		})
		cache.set(url, fresh.clone())
		return fresh
	}
	const cached = (build: string) => ({ ...deps(json(null), { build }), fetch })
	expect(await callServerFn(read, { a: 1 }, cached("b1"))).toBe("b1")
	live = "b2"
	const after = cached("b2")
	expect(await callServerFn(read, { a: 1 }, after)).toBe("b2")
	expect(after.reload).not.toHaveBeenCalled()
})

// The envelope's data is a wire value, so a Date or a Map arrives as the handler returned it; data that is no wire
// value makes the answer no envelope (B145).
it("wire data", async () => {
	const value = { at: new Date(5), map: new Map([["k", 1]]) }
	expect(await callServerFn(echo, 1, deps(json({ name: "echo", status: 200, data: value })))).toEqual(value)
	const raw = {
		body: JSON.stringify({ name: "echo", status: 200, data: { t: 999 } }),
		status: 200,
		headers: { "content-type": "application/json" },
	}
	expect(await rejection(callServerFn(echo, 1, deps(raw)))).toMatchObject({ message: "HTTP 200" })
})
