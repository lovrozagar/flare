import { expect, it } from "vitest"
import { stateScript } from "../../src/server/render/state.ts"
import { decodeLine, encodeFrame } from "../../src/shared/protocol/index.ts"
import { dataToWire, fromWire, toWire } from "../../src/shared/protocol/value.ts"

// Every kind of value an app can return, alone and nested, through each place the wire carries one: the codec, an `l`
// frame, the document's state script, and a server function's envelope. Each arrives equal, NaN and -0 and an invalid
// Date included, and the state script stays one script whatever the value's text holds (plan 21 6.2, B145).

const shared = { shared: true }
const cycle: Record<string, unknown> = { name: "cycle" }
cycle["self"] = cycle
const sparse: unknown[] = []
sparse[0] = 1
sparse[2] = 3
const bare: Record<string, unknown> = Object.create(null)
bare["key"] = "no prototype"

const VALUES: ReadonlyArray<readonly [string, unknown]> = [
	["zero", 0],
	["negative zero", -0],
	["NaN", Number.NaN],
	["infinities", [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]],
	["largest safe", Number.MAX_SAFE_INTEGER],
	["bigints", [0n, -1n, 10n ** 30n]],
	[
		"strings",
		["", "</script><script>alert(1)</script>", String.fromCodePoint(0x2028, 0x2029), "😀 é", "\u0000", "<!--", "]]>"],
	],
	["booleans and null", [true, false, null]],
	["undefined key", { gone: undefined }],
	["dates", [new Date(0), new Date(Number.NaN), new Date(8.64e15)]],
	["regexp", /a+(?<name>b)?/giu],
	[
		"map with object keys",
		new Map<unknown, unknown>([
			[{ key: 1 }, "value"],
			["text", new Date(1)],
		]),
	],
	["set of objects", new Set([{ a: 1 }, [2]])],
	["sparse array", sparse],
	["nested", { list: [{ deep: [{ deeper: new Map([["k", new Set([1n])]]) }] }] }],
	["prototype-named keys", JSON.parse('{"__proto__":1,"constructor":2,"toString":3}')],
	["null prototype", bare],
	["url", [new URL("https://flare.test/a?b=1#c"), new URLSearchParams("q=1&q=2")]],
	["typed arrays", [new Uint8Array([1, 2, 255]), new Float64Array([1.5, Number.NaN])]],
	["cycle", cycle],
	["shared reference", { a: shared, b: shared }],
]

function viaState(value: unknown): unknown {
	const html = stateScript({
		matches: [{ id: "p", params: {}, search: {}, data: value, preloader: {}, head: null, error: null }],
		nonce: "n",
		build: "b",
		at: 0,
	})
	// One script: its text holds no closing tag of its own, whatever the value's strings hold.
	expect(html.match(/<\/script/gi)).toHaveLength(1)
	const json = html.slice(html.indexOf("self.flare=") + "self.flare=".length, html.lastIndexOf("</script>"))
	const parsed: { matches: Array<{ data: unknown }> } = Function(`return ${json}`)()
	return fromWire(parsed.matches[0]?.data)
}

it.each(VALUES)("%s", (_name, value) => {
	expect(fromWire(JSON.parse(JSON.stringify(toWire(value))))).toStrictEqual(value)
	expect(decodeLine(encodeFrame({ t: "l", m: "p", d: value }))).toStrictEqual({ t: "l", m: "p", d: value })
	expect(viaState(value)).toStrictEqual(value)
	const envelope = JSON.parse(JSON.stringify(dataToWire({ name: "fn", status: 200, data: value })))
	expect(fromWire(envelope.data)).toStrictEqual(value)
})

// A shared reference stays one object, and a cycle points at itself, after the trip.
it("identity", () => {
	const back = fromWire(JSON.parse(JSON.stringify(toWire({ a: shared, b: shared, cycle })))) as {
		a: object
		b: object
		cycle: { self: unknown }
	}
	expect(back.a).toBe(back.b)
	expect(back.cycle.self).toBe(back.cycle)
	expect(Object.is(fromWire(toWire(-0)), -0)).toBe(true)
})
