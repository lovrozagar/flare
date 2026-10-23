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

type Later = Promise<unknown> | ReadableStream<unknown>

function isLater(value: unknown): value is Later {
	return value instanceof Promise || value instanceof ReadableStream
}

// One encode's refusal: its plugin, whether it met anything, and the failure that names what it met.
type Refusal = { plugin: NonNullable<FromJSONOptions["plugins"]>[number]; found: () => boolean; fail: () => never }

// seroval's sync form writes a Promise or a ReadableStream as a reference no later line settles, whatever its state, so
// the client would wait on it forever, and a rejection nothing read would end a Node server (BUGS.md 507). The encode
// side alone runs this ahead of the wire's plugins: it notes every one in the value, catches each promise and cancels
// each unlocked stream, so nothing runs unread, and the encode then fails once with what it met. fromWire and Solid's
// own serializer, which streams a promise, never see it; writing or reading a refused node is the same failure.
function refusal(): Refusal {
	const kinds = new Set<string>()
	const fail = (): never => {
		throw new TypeError(
			`${[...kinds].join(" and ")} inside the value cannot cross the wire: return a later value through defer()`,
		)
	}
	const plugin = createPlugin<Later, Record<string, never>>({
		tag: "flare/later",
		test: isLater,
		parse: {
			sync(value) {
				if (value instanceof Promise) {
					kinds.add("a Promise")
					value.catch(() => undefined)
				} else {
					kinds.add("a ReadableStream")
					if (!value.locked) value.cancel().catch(() => undefined)
				}
				return {}
			},
		},
		serialize: fail,
		deserialize: fail,
	})
	return { plugin, fail, found: () => kinds.size > 0 }
}

// An app value on the wire: seroval's JSON form, the codec Solid's own hydration data uses, so a loader's, a deferred
// value's, or a server function's value reaches the client as the server held it, whatever carries it: a Date, a
// BigInt, a Map, a Set, a URL, an undefined key, NaN (decision B145). A function or a class instance throws, and so does
// a Promise or a ReadableStream at any depth: a value that arrives later is defer()'s (BUGS.md 507). The envelope
// around it stays JSON.
export function toWire(value: unknown): SerovalJSON {
	const later = refusal()
	const wire = toJSON(value, { plugins: [later.plugin, ...wirePlugins] })
	if (later.found()) later.fail()
	return wire
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
