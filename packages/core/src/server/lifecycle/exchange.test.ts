import { expect, it, vi } from "vitest"
import { answer, bare, bounded, secure, typed } from "./exchange.ts"
import { createLogger } from "./logger.ts"

const exchange = {
	request: new Request("http://localhost/a"),
	secured: { headers: new Headers({ "x-frame-options": "DENY" }), nonce: "", config: {}, candidate: "" },
	sink: { dev: false, log: createLogger({ dev: false }) },
}

it("answer", async () => {
	const response = answer(exchange, 308, "/b")
	expect(response.status).toBe(308)
	expect(response.headers.get("location")).toBe("/b")
	expect(response.headers.get("x-frame-options")).toBe("DENY")
	expect(await response.text()).toBe("")
})

it("bare", async () => {
	const run = {
		response: new Response('{"issues":[]}', { status: 400, headers: { "content-type": "application/json" } }),
	}
	const response = await bare(exchange, run)
	expect(response.status).toBe(400)
	expect(response.headers.get("content-type")).toBe("application/json")
	expect(response.headers.get("x-frame-options")).toBe("DENY")
	expect(await response.text()).toBe('{"issues":[]}')
})

it("typed", () => {
	const headers = typed(exchange, "text/html; charset=utf-8")
	expect(headers.get("content-type")).toBe("text/html; charset=utf-8")
	expect(headers.get("x-frame-options")).toBe("DENY")
	expect(exchange.secured.headers.has("content-type")).toBe(false)
})

it("secure", async () => {
	const headers = new Headers({ "x-frame-options": "SAMEORIGIN", "x-own": "1" })
	const response = secure(exchange, { status: 201, body: "made", headers })
	expect(response.status).toBe(201)
	expect(response.headers.get("x-frame-options")).toBe("DENY")
	expect(response.headers.get("x-own")).toBe("1")
	expect(await response.text()).toBe("made")
})

// The boundary at server.fetch: a rejection and a synchronous throw are each logged once and answered as a 500 with
// the default security headers; an answer passes through (plan 21 9.1, BUGS.md 202).
it("bounded", async () => {
	const errors = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const rejected = await bounded(exchange.request, exchange.sink, () => Promise.reject(new Error("late")))
	const thrown = await bounded(exchange.request, exchange.sink, () => {
		throw new Error("early")
	})
	for (const response of [rejected, thrown]) {
		expect(response.status).toBe(500)
		expect(response.headers.get("x-content-type-options")).toBe("nosniff")
	}
	expect(errors).toHaveBeenCalledTimes(2)
	const fine = new Response("ok")
	expect(await bounded(exchange.request, exchange.sink, () => Promise.resolve(fine))).toBe(fine)
	errors.mockRestore()
})
