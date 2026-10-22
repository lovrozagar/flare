import { expect, it } from "vitest"
import { mutations, WORKERD_OWN } from "./fuzz.ts"
import { CORPUS, request } from "./hostile-corpus.ts"

const HOST = "127.0.0.1:4000"

// The same seed gives the same requests, another seed others; each is a whole raw HTTP/1.1 request.
it("seeded mutations", () => {
	const first = mutations(CORPUS, { seed: 42, count: 50 }).map((entry) => request(entry, HOST))
	const again = mutations(CORPUS, { seed: 42, count: 50 }).map((entry) => request(entry, HOST))
	const other = mutations(CORPUS, { seed: 7, count: 50 }).map((entry) => request(entry, HOST))
	expect(first).toHaveLength(50)
	expect(again).toEqual(first)
	expect(other).not.toEqual(first)
	const whole = first.filter((text) => !/^\S+ \S+ HTTP\/1\.1\r\n[\s\S]*\r\n\r\n/.test(text))
	expect(whole).toEqual([])
})

// Every kind of mutation turns up over a run: method, path, Host, Content-Length, a repeated header, a long header.
it("mutation kinds", () => {
	const kinds = new Set(mutations(CORPUS, { seed: 1, count: 400 }).map((entry) => entry.name.split(":")[0]))
	expect([...kinds].toSorted()).toEqual(["content-length", "host", "long-header", "method", "path", "repeated-header"])
})

// A mutation is named after the corpus entry it came from and what it changed, so a failure says what was sent.
it("named", () => {
	const [entry] = mutations(CORPUS, { seed: 3, count: 1 })
	expect(entry?.name).toMatch(/^[a-z-]+: .+ from .+$/)
})

// workerd's own answers are the mutations it refuses before the worker runs, and no other: a valid Content-Length or an
// uppercase method still reaches Flare.
it("workerd's own", () => {
	const own = ['host: "a b" from home', "content-length: -1 from home", "content-length: 1, 1 from home"]
	const theirs = ["content-length: 0 from home", "method: GET from home", "method: TRACE from home"]
	expect([...own, "method: CONNECT from home", "method: get from home"].every((name) => WORKERD_OWN.test(name))).toBe(
		true,
	)
	expect(theirs.filter((name) => WORKERD_OWN.test(name))).toEqual([])
})
