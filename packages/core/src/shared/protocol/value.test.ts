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
