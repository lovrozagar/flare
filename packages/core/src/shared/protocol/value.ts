import { createPlugin, fromJSON, toJSON, type FromJSONOptions, type SerovalJSON, type SerovalNode } from "seroval"
import { URLPlugin, URLSearchParamsPlugin } from "seroval-plugins/web"

// A server deferred value before it reaches the wire: an object whose `toJSON` gives its placeholder (dx/defer.md).
type Placeholder = { __deferred: true; toJSON: () => unknown }

function isPlaceholder(value: unknown): value is Placeholder {
	return (
		typeof value === "object" &&
		value !== null &&
		Reflect.get(value, "__deferred") === true &&
		typeof Reflect.get(value, "toJSON") === "function"
	)
}

// seroval refuses a class instance, so the server's deferred value travels as its placeholder, `{ __deferred, key }`
// and an inline value when the store resolved it, which the client turns into its own deferred value.
const deferredPlugin = createPlugin<Placeholder, { wire: SerovalNode }>({
	tag: "flare/deferred",
	test: isPlaceholder,
	parse: { sync: (value, ctx) => ({ wire: ctx.parse(value.toJSON()) }) },
	serialize: (node, ctx) => ctx.serialize(node.wire),
	deserialize: (node, ctx) => ctx.deserialize(node.wire) as Placeholder,
})

// The wire's plugins. seroval's JS form, which the wire does not use, reads them too.
export const wirePlugins: NonNullable<FromJSONOptions["plugins"]> = [deferredPlugin, URLPlugin, URLSearchParamsPlugin]

// An app value on the wire: seroval's JSON form, the codec Solid's own hydration data uses, so a loader's, a deferred
// value's, or a server function's value reaches the client as the server held it, whatever carries it: a Date, a
// BigInt, a Map, a Set, a URL, an undefined key, NaN (decision B145). A function or a class instance throws. The
// envelope around it stays JSON.
export function toWire(value: unknown): SerovalJSON {
	return toJSON(value, { plugins: wirePlugins })
}

// A server-function envelope with its `data` on the wire; the envelope itself is JSON (dx/server-fn.md).
export function dataToWire<T extends object>(envelope: T): T {
	return "data" in envelope ? { ...envelope, data: toWire(envelope.data) } : envelope
}

// A wire value back as the value. A node seroval cannot read throws.
export function fromWire(wire: unknown): unknown {
	return fromJSON(wire as SerovalJSON, { plugins: wirePlugins })
}

// A document state match's app values: its data, its preloader context, and its validated params and search, each a
// wire value in the state script as in a navigation's frames (B145). Its id, head, and error stay JSON.
const MATCH_VALUES = ["data", "preloader", "params", "search"] as const

// A state match as the state script holds it.
export function matchToWire<T extends object>(match: T): T {
	return codedMatch(match, toWire)
}

// A state match as the server held it.
export function matchFromWire<T extends object>(match: T): T {
	return codedMatch(match, fromWire)
}

function codedMatch<T extends object>(match: T, codec: (value: unknown) => unknown): T {
	const coded: Record<string, unknown> = Object.fromEntries(Object.entries(match))
	for (const key of MATCH_VALUES) coded[key] = codec(coded[key])
	return coded as T
}
