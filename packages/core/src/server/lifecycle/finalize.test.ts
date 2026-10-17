import { expect, it } from "vitest"
import { unauthenticated } from "../../shared/errors/http.ts"
import { defaultHeaders } from "../security/defaults.ts"
import { finalize, keptAs, streamsBody } from "./finalize.ts"

const url = "https://example.com/"

function expectSet(response: Response): void {
	for (const [name, value] of defaultHeaders(url)) {
		expect(response.headers.get(name)).toBe(value)
	}
	expect(response.headers.has("server-timing")).toBe(false)
}

it("only finalize builds a Response", async () => {
	const stage = { status: 201, body: "hi" }
	expect(stage).not.toBeInstanceOf(Response)
	const response = finalize(stage)
	expect(response).toBeInstanceOf(Response)
	expect(response.status).toBe(201)
	expect(await response.text()).toBe("hi")
})

it("flare-render", () => {
	const response = finalize({ status: 200, body: "<html></html>", render: "ssr" })
	expect(response.headers.get("flare-render")).toBe("ssr")
})

it("401 has the set", () => {
	const response = finalize({
		status: 200,
		body: "page",
		url,
		build: "b1",
		run: () => {
			unauthenticated()
		},
	})
	expect(response.status).toBe(401)
	expectSet(response)
})

it("404 has the set", () => {
	const response = finalize({ status: 404, body: "Not found", url, build: "b1" })
	expect(response.status).toBe(404)
	expectSet(response)
})

it("redirect has the set", () => {
	const response = finalize({ status: 301, body: "", location: "/next", url, build: "b1" })
	expect(response.status).toBe(301)
	expect(response.headers.get("location")).toBe("/next")
	expectSet(response)
})

it("500 has the set", () => {
	const response = finalize({
		status: 200,
		body: "page",
		url,
		build: "b1",
		run: () => {
			throw new Error("boom")
		},
	})
	expect(response.status).toBe(500)
	expectSet(response)
})

it("flare-build", () => {
	expect(finalize({ status: 200, body: "ok", build: "build-42", url }).headers.get("flare-build")).toBe("build-42")
})

it("no server timing", () => {
	expect(finalize({ status: 200, body: "ok", build: "build-42", url }).headers.has("server-timing")).toBe(false)
})

// Every Set-Cookie value arrives. A `set()` per header kept only the last.
it("cookies kept", () => {
	const headers = new Headers()
	headers.append("set-cookie", "a=1")
	headers.append("set-cookie", "b=2")
	expect(finalize({ status: 200, body: "", url, headers }).headers.getSetCookie()).toEqual(["a=1", "b=2"])
})

// The app's own Response takes the built answer's headers and leaves as itself, its body unread, counted as streaming
// since it may; one whose headers cannot change, as a redirect's or a fetch() answer's cannot, is not kept
// (plan 21 12.7).
it("kept as", () => {
	const own = new Response("down", { status: 503, headers: { "x-own": "1", "set-cookie": "a=1" } })
	const built = finalize({
		status: 503,
		body: null,
		url: "https://example.com/",
		headers: new Headers({ "x-built": "2" }),
	})
	built.headers.append("set-cookie", "b=2")
	expect(keptAs(own, built)).toBe(own)
	expect(own.headers.get("x-own")).toBeNull()
	expect(own.headers.get("x-built")).toBe("2")
	expect(own.headers.get("x-content-type-options")).toBe("nosniff")
	expect(own.headers.getSetCookie()).toEqual(["b=2"])
	expect(own.bodyUsed).toBe(false)
	expect(streamsBody(own)).toBe(true)
	// Bun lets a redirect's headers change, so there it is kept too.
	const redirect = Response.redirect("https://example.com/next", 302)
	expect(keptAs(redirect, built)).toBe(Reflect.get(globalThis, "Bun") === undefined ? undefined : redirect)
})
