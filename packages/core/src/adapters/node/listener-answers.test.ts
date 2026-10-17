import { expect, it, vi } from "vitest"
import { adaptedOf, createNodeListener } from "./listener.ts"

// The answers the Node listener gives itself, which never reach the server: a 400 for a request it cannot route and the
// 500 of a failure before the headers. Split from listener.test.ts at its 500-line limit.

function req(): { method: string; url: string; headers: Record<string, string> } {
	return { method: "GET", url: "/", headers: {} }
}

function settle(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0)
	})
}

// A failure before the headers is a 500 with no body, and it is logged (plan 21 13.6); like every answer it names its
// build and carries the default security set (BUGS.md 341).
it("fetch throws", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const statuses: number[] = []
	const named: string[] = []
	let ended = false
	const listener = createNodeListener({
		fetch: () => Promise.reject(new Error("server broke")),
	})
	listener(req(), {
		writeHead(status) {
			statuses.push(status)
		},
		setHeader(name) {
			named.push(name.toLowerCase())
		},
		write: () => true,
		end() {
			ended = true
		},
		once() {},
	})
	await settle()
	expect(statuses).toEqual([500])
	expect(named).toEqual(expect.arrayContaining(["flare-build", "x-content-type-options", "content-security-policy"]))
	expect(ended).toBe(true)
	expect(logged).toHaveBeenCalledExactlyOnceWith("[flare:node]", "the request failed", expect.any(Error))
	logged.mockRestore()
})

// A target or Host the listener cannot route is its own 400, never the server's, and like every answer it names its
// build and carries the default security set (BUGS.md 341).
it("bad target", async () => {
	const seen: Request[] = []
	const listener = createNodeListener({
		fetch: (request) => {
			seen.push(request)
			return new Response("done")
		},
	})
	const answers: { status: number; named: string[] }[] = []
	for (const asked of [{ url: "//evil" }, { headers: { host: "a?b" } }]) {
		const answer = { status: 0, named: [] as string[] }
		let ended = false
		listener(
			{ ...req(), ...asked },
			{
				writeHead(status) {
					answer.status = status
				},
				setHeader(name) {
					answer.named.push(name.toLowerCase())
				},
				write: () => true,
				end() {
					ended = true
				},
				once() {},
			},
		)
		await settle()
		expect(ended).toBe(true)
		answers.push(answer)
	}
	expect(seen).toEqual([])
	for (const answer of answers) {
		expect(answer.status).toBe(400)
		expect(answer.named).toEqual(expect.arrayContaining(["flare-build", "x-content-type-options"]))
	}
})

// The listener hands the socket's address on, so `trustProxy` of 0, or fewer forwarded entries than it trusts, reads
// the socket and never a client's claim (dx/server.md Client address, BUGS.md 342).
it("socket address", () => {
	const at = (headers: Record<string, string>, trustProxy: number) =>
		adaptedOf(
			{ ...req(), headers: { host: "site.test", ...headers }, socket: { remoteAddress: "10.0.0.9" } },
			trustProxy,
		)
	expect(at({ "x-forwarded-for": "1.1.1.1" }, 0).clientIp).toBe("10.0.0.9")
	expect(at({ "x-forwarded-for": "1.1.1.1" }, 2).clientIp).toBe("10.0.0.9")
	expect(at({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }, 1).clientIp).toBe("2.2.2.2")
	expect(adaptedOf({ ...req(), headers: { host: "site.test" } }, 0).clientIp).toBe("")
})
