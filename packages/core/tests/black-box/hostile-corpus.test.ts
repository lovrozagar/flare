import { expect, it } from "vitest"
import { CORPUS, invariantProblems, PROBE, request, typeClass } from "./hostile-corpus.ts"

const clean = { status: 404, head: "HTTP/1.1 404 Not Found\r\ncontent-type: text/html", body: "<p>Not found</p>" }

// A clean answer breaks no invariant, in dev or prod.
it("clean answer", () => {
	expect(invariantProblems(clean, { prod: true })).toEqual([])
	expect(invariantProblems(clean, { prod: false })).toEqual([])
})

// Each invariant, broken once: a stack trace, a machine path, the probe reflected unescaped, an injected header, and a
// Server-Timing header in prod (dev may send one).
it("each invariant", () => {
	const broken = (patch: Partial<typeof clean>) => invariantProblems({ ...clean, ...patch }, { prod: true })
	expect(broken({ body: "Error: boom\n    at render (file:///srv/app/server.js:12:3)" })).toEqual(["stack trace"])
	expect(broken({ body: "cannot read /home/someone/app/src/x.ts" })).toEqual(["machine path"])
	expect(broken({ body: "C:\\Users\\a\\x.js" })).toEqual(["machine path"])
	expect(broken({ body: "at node_modules/vite/dist/x.js" })).toEqual(["machine path"])
	expect(broken({ body: `<p>${PROBE}</p>` })).toEqual(["probe reflected"])
	expect(broken({ head: `${clean.head}\r\nSet-Cookie: x=1` })).toEqual(["injected header"])
	expect(broken({ head: `${clean.head}\r\nserver-timing: render;dur=3` })).toEqual(["server-timing in prod"])
	expect(invariantProblems({ ...clean, head: `${clean.head}\r\nserver-timing: x` }, { prod: false })).toEqual([])
	// The probe escaped is the probe shown, not run.
	expect(broken({ body: "<p>&lt;flare-probe&gt;</p>" })).toEqual([])
})

// The content-type class of an answer: html, json, ndjson, text, or none.
it("type class", () => {
	expect(typeClass("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8")).toBe("html")
	expect(typeClass("HTTP/1.1 400 Bad Request\r\ncontent-type: application/json")).toBe("json")
	expect(typeClass("HTTP/1.1 200 OK\r\ncontent-type: application/x-ndjson")).toBe("ndjson")
	expect(typeClass("HTTP/1.1 400 Bad Request\r\ncontent-type: text/plain")).toBe("text")
	expect(typeClass("HTTP/1.1 204 No Content")).toBe("none")
})

// Every entry is a well-formed raw request for the given Host, and names are unique.
it("corpus shape", () => {
	expect(new Set(CORPUS.map((entry) => entry.name)).size).toBe(CORPUS.length)
	const malformed = CORPUS.filter(
		(entry) =>
			!/^[A-Z]+ \S+ HTTP\/1\.1\r\nHost: [^\r\n]+\r\n[\s\S]*\r\n\r\n/.test(request(entry, "127.0.0.1:4000")) ||
			entry.status < 200,
	)
	expect(malformed.map((entry) => entry.name)).toEqual([])
})
