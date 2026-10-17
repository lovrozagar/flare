import { parseSegment, type Segment } from "./segments.ts"

export type RawParams = Record<string, string | string[] | undefined>

// `accepts` may refuse a value for a named single segment, such as a locale param that holds no tag. A refused
// optional segment stays empty, and a refused required one does not match.
export type MatchOptions = { caseSensitive?: boolean; accepts?: (name: string, value: string) => boolean }

type Walk = {
	segments: readonly Segment[]
	parts: readonly string[]
	sensitive: boolean
	accepts: (name: string, value: string) => boolean
}

function acceptsAll(): boolean {
	return true
}

export function matchPath(pattern: string, path: string, options: MatchOptions = {}): boolean {
	return matchParams(pattern, path, options) !== undefined
}

// Segment by segment over the bracket syntax codegen emits. An optional or catch-all segment tries the
// longest take first and backs off. Values stay raw (B81).
export function matchParams(pattern: string, path: string, options: MatchOptions = {}): RawParams | undefined {
	const walk = {
		segments: patternSegments(pattern),
		parts: path.split("/").filter((part) => part !== ""),
		sensitive: options.caseSensitive === true,
		accepts: options.accepts ?? acceptsAll,
	}
	return step(walk, 0, 0)
}

export function patternSegments(pattern: string): Segment[] {
	return pattern
		.split("/")
		.filter((folder) => folder !== "")
		.flatMap((folder) => parseSegment(folder))
}

function step(walk: Walk, at: number, from: number): RawParams | undefined {
	const segment = walk.segments[at]
	if (segment === undefined) return from === walk.parts.length ? {} : undefined
	if (segment.kind === "static") {
		const part = walk.parts[from]
		if (part === undefined || !sameStatic(segment.text, part, walk.sensitive)) return undefined
		return step(walk, at + 1, from + 1)
	}
	const most = segment.kind === "dynamic" ? Math.min(1, walk.parts.length - from) : walk.parts.length - from
	const least = segment.optional ? 0 : 1
	for (let take = most; take >= least; take -= 1) {
		const first = walk.parts[from]
		if (segment.kind === "dynamic" && take === 1 && first !== undefined && !walk.accepts(segment.name, first)) continue
		const rest = step(walk, at + 1, from + take)
		if (rest !== undefined) return { ...rest, [segment.name]: value(segment.kind, walk.parts.slice(from, from + take)) }
	}
	return undefined
}

function value(kind: "dynamic" | "catch-all", taken: readonly string[]): string | string[] | undefined {
	const [first] = taken
	if (first === undefined) return undefined
	if (kind === "dynamic") return upperHex(first)
	return taken.map(upperHex)
}

// The characters a URL parser percent-encodes in a pathname, beside C0 controls, DEL, and non-ASCII.
const PATH_ENCODED = ' "#<>?^`{}'

// A static segment as a URL parser writes it. The matcher compares against this form, and buildUrl emits it.
export function encodeStatic(text: string): string {
	return upperHex(pathEncode(text))
}

function sameStatic(text: string, part: string, sensitive: boolean): boolean {
	return staticKey(text, sensitive) === partKey(part, sensitive)
}

// The forms a static segment and a path segment compare in, so an index keyed by them finds what the matcher matches.
export function staticKey(text: string, sensitive: boolean): string {
	const encoded = encodeStatic(text)
	return sensitive ? encoded : encoded.toLowerCase()
}

export function partKey(part: string, sensitive: boolean): string {
	const written = upperHex(part)
	return sensitive ? written : written.toLowerCase()
}

function pathEncode(text: string): string {
	let out = ""
	for (const char of text) {
		const code = char.charCodeAt(0)
		const encoded = code < 0x20 || code > 0x7e || PATH_ENCODED.includes(char)
		out += encoded ? encodeURIComponent(char) : char
	}
	return out
}

// A valid %HH is uppercased and not decoded. %ZZ, a trailing %, and %2 stay as written (B81).
function upperHex(value: string): string {
	let out = ""
	for (let index = 0; index < value.length; index += 1) {
		const char = value.charAt(index)
		if (char !== "%") {
			out += char
			continue
		}
		const hex = value.slice(index + 1, index + 3)
		if (!/^[0-9A-Fa-f]{2}$/.test(hex)) {
			out += "%"
			continue
		}
		out += `%${hex.toUpperCase()}`
		index += 2
	}
	return out
}
