import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { deserialize, serialize } from "seroval"
import { expect, it } from "vitest"
import { fromWire, matchFromWire, matchToWire, toWire, wirePlugins } from "./value.ts"

// A wire value is JSON text, read back as the value it was.
function round(value: unknown): unknown {
	return fromWire(JSON.parse(JSON.stringify(toWire(value))))
}

// What JSON loses arrives as the server held it: a Date, a BigInt, a Map, a Set, a URL, its search params, an
// undefined key, NaN, and a nested Date (decision B145).
it("rich values", () => {
	const value = {
		at: new Date(5),
		big: 7n,
		map: new Map([["k", 1]]),
		set: new Set(["s"]),
		url: new URL("https://flare.test/a?b=1"),
		search: new URLSearchParams("q=1"),
		gone: undefined,
		nan: Number.NaN,
		list: [new Date(9)],
	}
	expect(round(value)).toEqual(value)
	const back = round(value) as typeof value
	expect(back.at).toBeInstanceOf(Date)
	expect(back.url).toBeInstanceOf(URL)
	expect("gone" in back).toBe(true)
	expect(round(undefined)).toBeUndefined()
	expect(round("plain")).toBe("plain")
})

// A server deferred value travels as its placeholder, a plain object the client turns into its own deferred value.
it("deferred placeholder", () => {
	class Deferred {
		readonly __deferred = true
		readonly key = "d0"
		get promise(): Promise<number> {
			return Promise.resolve(1)
		}
		toJSON(): unknown {
			return { __deferred: true, key: this.key, value: new Date(3) }
		}
	}
	const placeholder = { later: { __deferred: true, key: "d0", value: new Date(3) } }
	expect(round({ later: new Deferred() })).toEqual(placeholder)
	expect(deserialize(serialize({ later: new Deferred() }, { plugins: wirePlugins }))).toEqual(placeholder)
})

// A function or a class instance is no wire value. A `__proto__` key stays an own key, as JSON.parse keeps it, and the
// prototype is untouched.
it("refused and hostile", () => {
	class Thing {}
	expect(() => toWire({ fn: () => 1 })).toThrow(/Seroval/)
	expect(() => toWire({ thing: new Thing() })).toThrow(/Seroval/)
	const hostile = round(JSON.parse('{"__proto__":{"polluted":true}}')) as object
	expect(Object.keys(hostile)).toEqual(["__proto__"])
	expect(Object.getPrototypeOf(hostile)).toBe(Object.prototype)
	expect(Reflect.get({}, "polluted")).toBeUndefined()
	expect(() => fromWire({ t: 999 })).toThrow(/Seroval|undefined|null/)
})

// A state match's data, preloader context, params, and search cross as wire values, a validated Date or BigInt
// included; its id, head, and error stay JSON (B145).
it("state match", () => {
	const match = {
		id: "_root_/p",
		params: { id: 7n },
		search: { from: new Date(5) },
		data: new Map([["k", 1]]),
		preloader: { user: undefined },
		head: { title: "P" },
		error: null,
	}
	const sent = JSON.parse(JSON.stringify(matchToWire(match)))
	expect([sent.id, sent.head, sent.error]).toEqual(["_root_/p", { title: "P" }, null])
	expect(matchFromWire(sent)).toStrictEqual(match)
})

// A Promise or a ReadableStream is no wire value at any depth: seroval's sync form would write one as a reference that
// never settles, whatever its state. The encode names what it refused and points at defer() (BUGS.md 507).
it("promise and stream refused", () => {
	const refused = /^a Promise inside the value cannot cross the wire: return a later value through defer\(\)$/
	expect(() => toWire({ a: Promise.resolve(1) })).toThrow(refused)
	expect(() => toWire(new Map([[1, Promise.resolve(1)]]))).toThrow(refused)
	expect(() => toWire({ x: [{ s: new ReadableStream() }] })).toThrow(
		/^a ReadableStream inside the value cannot cross the wire/,
	)
	expect(() => toWire({ a: Promise.resolve(1), s: new ReadableStream() })).toThrow(
		/^a Promise and a ReadableStream inside the value cannot cross the wire/,
	)
	expect(round({ a: 1, at: new Date(0) })).toEqual({ a: 1, at: new Date(0) })
})

// The refusal reads the whole value before it throws: every promise, in any branch, is observed, so one that rejects
// later is no unhandled rejection, and every unlocked stream is cancelled, so nothing runs unread (BUGS.md 507).
it("refusal observes all", async () => {
	const unhandled: unknown[] = []
	const note = (reason: unknown): void => void unhandled.push(reason)
	process.on("unhandledRejection", note)
	try {
		const cancelled: unknown[] = []
		const stream = new ReadableStream({ cancel: (reason) => void cancelled.push(reason) })
		const late = new Promise((_, fail) => setTimeout(() => fail(new Error("inner down")), 10))
		expect(() => toWire({ first: { a: Promise.resolve(1) }, second: [late], third: { stream } })).toThrow(
			/^a Promise and a ReadableStream inside/,
		)
		await new Promise((done) => setTimeout(done, 50))
		expect(unhandled).toEqual([])
		expect(cancelled).toHaveLength(1)
		// A stream whose cancel fails is no unhandled rejection either.
		const failing = new ReadableStream({
			cancel: () => {
				throw new Error("cancel down")
			},
		})
		expect(() => toWire({ failing })).toThrow(/ReadableStream/)
		await new Promise((done) => setTimeout(done, 10))
		expect(unhandled).toEqual([])
		const locked = new ReadableStream()
		const reader = locked.getReader()
		expect(() => toWire({ locked })).toThrow(/ReadableStream/)
		reader.releaseLock()
	} finally {
		process.off("unhandledRejection", note)
	}
})

// Under plain Node, whose default ends the process on an unhandled rejection: two promises in different branches, one
// rejecting after the encode refused them, leave the process to exit 0 (BUGS.md 507).
it("refusal under node", () => {
	const value = fileURLToPath(new URL("./value.ts", import.meta.url))
	const script = `
		const { toWire } = await import(${JSON.stringify(value)})
		const late = new Promise((_, fail) => setTimeout(() => fail(new Error("inner down")), 20))
		try { toWire({ a: { p: Promise.resolve(1) }, b: [late] }) } catch (error) { console.log(error.message) }
		await new Promise((done) => setTimeout(done, 100))
		console.log("still running")
	`
	const run = spawnSync("node", ["--input-type=module", "-e", script], { encoding: "utf8" })
	expect([run.status, run.signal, run.stdout, run.stderr]).toEqual([
		0,
		null,
		"a Promise inside the value cannot cross the wire: return a later value through defer()\nstill running\n",
		"",
	])
})
