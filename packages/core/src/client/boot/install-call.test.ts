import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { encodeFrame } from "../../shared/protocol/index.ts"
import { dataToWire } from "../../shared/protocol/value.ts"
import { createServerFn } from "../server-fn/call.ts"
import { env, install, routerOf, stops, type Dom } from "./boot.fixture.ts"
import { bootClient, type ClientEnv } from "./create-client.ts"
import { createReady } from "./ready.ts"

// The server function transport bootClient installs (install-call.ts), through the boot. Split from
// create-client.test.ts at its 500-line limit.

beforeEach(() => {
	history.replaceState(null, "", "/")
	document.documentElement.removeAttribute("data-flare-hydrated")
})

afterEach(() => {
	for (const stop of stops.splice(0)) stop()
	delete (globalThis as Dom).flare
})

// bootClient writes the transport onto self.flare: a handler posts and resolves its data (bits/07). The state already
// on self.flare stays.
it("server fn call", async () => {
	const host = install("b1")
	const answers: Record<string, () => Response> = {
		"/_flare/fn/echo": () => Response.json(dataToWire({ name: "echo", status: 200, data: { n: 1 } })),
		"/_flare/fn/moved": () =>
			Response.json({ name: "moved", status: 303, redirect: { to: "/#top", status: 303, replace: true } }),
		"/_flare/fn/stale": () =>
			Response.json(dataToWire({ name: "stale", status: 200, data: 1 }), { headers: { "flare-build": "b2" } }),
	}
	// The redirect revalidates: its data request gets the home page (BUGS.md 321).
	const home = [encodeFrame({ t: "l", m: "_root_/", d: "x" }), encodeFrame({ t: "r" }), encodeFrame({ t: "d" })]
	const fetch = vi.fn<ClientEnv["fetch"]>(async (url) =>
		(answers[String(url)] ?? (() => new Response(home.join(""))))(),
	)
	const browser = env(host, fetch)
	stops.push(await bootClient(routerOf(), createReady(), browser))
	const flare = Object((globalThis as Dom).flare)
	const call: unknown = Reflect.get(flare, "call")
	if (typeof call !== "function") throw new Error("no self.flare.call")
	expect(Reflect.get(flare, "nonce")).toBe("")
	const echo = { id: "echo", name: "echo", record: { method: "post", authenticate: false } }
	expect(await Reflect.apply(call, undefined, [echo, { a: 1 }])).toEqual({ n: 1 })
	expect(fetch.mock.calls[0]?.[0]).toBe("/_flare/fn/echo")
	// A same-origin redirect is the internal URL navigation, and the call still rejects.
	const moved = { id: "moved", name: "moved", record: { method: "post", authenticate: false } }
	await expect(Reflect.apply(call, undefined, [moved, null])).rejects.toThrow("HTTP 303")
	await vi.waitFor(() => expect(window.location.hash).toBe("#top"))
	// Another build's answer reloads the page on screen once, under the chunk guard.
	const stale = { id: "stale", name: "stale", record: { method: "post", authenticate: false } }
	await expect(Reflect.apply(call, undefined, [stale, null])).rejects.toThrow("The app was updated")
	expect(browser.assign).toHaveBeenCalledWith(window.location.href)
})

// The client graph's stream function as the boundary transform emits it, its generator stripped to `undefined`: the
// booted transport sends it to the NDJSON reader by its kind (BUGS.md B14). A variable, so its fields type-check.
it("stream call", async () => {
	const host = install("b1")
	const ndjson =
		`${[1, 2].map((data) => JSON.stringify(dataToWire({ name: "ticks", status: 200, data }))).join("\n")}\n` +
		'{"name":"ticks","status":200,"end":true}\n'
	const fetch = vi.fn<ClientEnv["fetch"]>(
		async () => new Response(ndjson, { headers: { "content-type": "application/x-ndjson" } }),
	)
	stops.push(await bootClient(routerOf(), createReady(), env(host, fetch)))
	const config = { method: "post" as const, __id: "ticks", __name: "ticks", __client: true }
	const ticks = createServerFn(config).stream(undefined as never)
	const seen: unknown[] = []
	for await (const value of ticks()) seen.push(value)
	expect(seen).toEqual([1, 2])
	expect(fetch).toHaveBeenCalledOnce()
	expect(fetch.mock.calls[0]?.[0]).toBe("/_flare/fn/ticks")
})
