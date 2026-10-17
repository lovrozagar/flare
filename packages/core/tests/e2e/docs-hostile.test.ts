import { connect } from "node:net"
import { expect, fnId, isProd, serverOf, test } from "./docs.fixture.ts"

// One raw HTTP/1.1 request, as a client that does not normalize sends it: the status, and the headers the answer
// carries. The path is written as it is, dot segments and escapes included.
function raw(origin: string, request: string): Promise<{ status: number; headers: string }> {
	const url = new URL(origin)
	return new Promise((resolve, reject) => {
		const socket = connect(Number(url.port), url.hostname, () => socket.write(request))
		let text = ""
		socket.setEncoding("latin1")
		socket.on("data", (chunk: string) => {
			text += chunk
			if (text.includes("\r\n\r\n")) {
				const head = text.slice(0, text.indexOf("\r\n\r\n"))
				socket.destroy()
				resolve({ status: Number(head.split(" ")[1]), headers: head })
			}
		})
		socket.on("error", reject)
		socket.on("close", () => reject(new Error("closed with no answer")))
		socket.setTimeout(5000, () => {
			socket.destroy()
			reject(new Error(`no answer to ${request.split("\r\n")[0]}`))
		})
	})
}

const ECHO = fnId("src/fns/echo.ts", "echo")

function get(path: string, headers: Record<string, string> = {}, method = "GET"): (host: string) => string {
	return (host) => {
		const lines = [`${method} ${path} HTTP/1.1`, `Host: ${headers["Host"] ?? host}`, "Connection: close"]
		for (const [name, value] of Object.entries(headers)) if (name !== "Host") lines.push(`${name}: ${value}`)
		return `${lines.join("\r\n")}\r\n\r\n`
	}
}

// Each request with the answer every runtime gives it (plan 21 17.1). A path with dot segments, encoded or not, is the
// path they name, as a URL parser reads it; an encoded slash, a `//` or `\\` start, and a Host that holds a path are 400;
// a malformed or NUL escape names no page; a page answers GET and HEAD, 204 to OPTIONS, and 405 to the rest; a server
// function answers only its own method, and its input decides a body it cannot read.
const CORPUS: ReadonlyArray<readonly [string, (host: string) => string, number]> = [
	["home", get("/"), 200],
	["dot segments", get("/docs/../docs/routing"), 200],
	["encoded dot segments", get("/docs/%2e%2e/docs/routing"), 200],
	["encoded slash", get("/docs%2Frouting"), 400],
	["encoded slash lower", get("/docs%2frouting"), 400],
	["bad escape", get("/docs/%zz"), 404],
	["nul escape", get("/docs/%00"), 404],
	["double slash", get("//evil.example/"), 400],
	["backslash", get("/\\evil.example/"), 400],
	["host with path", get("/docs/routing", { Host: "evil.example/admin?" }), 400],
	["foreign host", get("/docs/routing", { Host: "evil.example" }), 200],
	["post page", get("/docs/routing", {}, "POST"), 405],
	["put page", get("/docs/routing", {}, "PUT"), 405],
	["options page", get("/docs/routing", {}, "OPTIONS"), 204],
	["head page", get("/docs/routing", {}, "HEAD"), 200],
	["data twice", get("/docs/routing?_flare=data&_flare=data"), 200],
	["unknown mode", get("/docs/routing?_flare=nope"), 400],
	["unknown fn", get("/_flare/fn/0000000000000000"), 404],
	[
		"fn empty body",
		get(`/_flare/fn/${ECHO}`, { "Content-Type": "application/json", "Content-Length": "0" }, "POST"),
		400,
	],
	["fn get", get(`/_flare/fn/${ECHO}`), 405],
	["long path", get(`/${"a".repeat(8000)}`), 404],
	["query injection", get("/docs/routing?next=https://evil.example&q=%0d%0aSet-Cookie:x=1"), 200],
]

// workerd itself refuses a Host that holds a path: it throws stringifying the URL and answers 500 before the worker
// runs. Cloudflare's edge validates Host first, so such a request never reaches a deployed worker.
const RUNTIME: Record<string, Record<string, number>> = { "workers-prod": { "host with path": 500 } }

// Every request of the corpus, raw, against the production server of each runtime, and its answer (plan 21 17.1).
test("hostile corpus", async ({ docs }, info) => {
	test.skip(!isProd(info) || info.project.name.split("-")[2] !== "chromium", "once per server")
	const host = new URL(docs.origin).host
	const answered: Array<[string, number | string]> = []
	for (const [name, request] of CORPUS) {
		const status = await raw(docs.origin, request(host)).then(
			(seen) => seen.status,
			(error: unknown) => String(error),
		)
		answered.push([name, status])
	}
	const expected = CORPUS.map(([name, , status]): [string, number] => [name, RUNTIME[serverOf(info)]?.[name] ?? status])
	expect(answered).toEqual(expected)
})
