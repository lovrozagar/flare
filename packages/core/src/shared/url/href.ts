import type { FlareRegister, To, UrlTarget } from "../route-builder/register.ts"
import { encodeStatic, idPattern, patternSegments, type Segment } from "../route-tree/index.ts"
import { entries, urlText, writeUrl } from "./search.ts"

declare const hrefBrand: unique symbol

export type Href = string & { readonly [hrefBrand]: never }

// A brand has no runtime value, so the checks below are the only way to make one, and each `as Href` follows them.
export function href(value: string): Href {
	if (value.charCodeAt(0) <= 0x20) throw new Error("href")
	// A browser drops tab, CR, and LF anywhere and reads a backslash as a slash, so `/\x` and a slash, a tab, and a
	// slash are `//x`, another origin (BUGS.md 155).
	if (
		value
			.replaceAll(/[\t\n\r]/g, "")
			.replaceAll("\\", "/")
			.startsWith("//")
	)
		throw new Error("href")
	if (value.startsWith("/")) return value as Href
	const lower = value.toLowerCase()
	if (lower.startsWith("https:") || lower.startsWith("http:")) return value as Href
	throw new Error("href")
}

// `params` and `search` are the validator output, whatever its type (dx/link.md URL values).
export type BuildInput = {
	to: string
	params?: object | undefined
	search?: object | undefined
	hash?: string | undefined
}

// The URL of a route id. The pattern comes from the same idPattern and segment parser the router matches with,
// so a built URL is always one the router matches (bit 05).
export function buildUrl(input: BuildInput): Href {
	const params = entries(input.params ?? {})
	const parts = patternSegments(idPattern(input.to)).flatMap((segment) => urlParts(segment, params))
	const hash = input.hash?.replace(/^#/, "")
	return href(writeUrl({ path: `/${parts.join("/")}`, search: input.search, hash }))
}

// `buildUrl` as an app imports it from `@lovrozagar/flare` (BUGS.md 137): generic on a page id, with that page's
// params and search once the register is augmented, as `navigate` takes them (dx/types.md).
export const routeUrl: <Id extends To<FlareRegister>>(target: UrlTarget<FlareRegister, Id>) => Href = buildUrl

// A static segment is path-encoded. A param value is one encoded segment, and a catch-all value is one per
// item. A missing optional value, or an empty optional catch-all, adds nothing.
function urlParts(segment: Segment, params: Record<string, unknown>): string[] {
	if (segment.kind === "static") return [encodeStatic(segment.text)]
	const value = params[segment.name]
	const values = urlText(segment.name, value)
	// An empty string is no value: written, it would be another route's URL (BUGS.md 307).
	const absent = values.length === 0 || (values.length === 1 && values[0] === "")
	if (absent && segment.optional) return []
	if (absent || values.includes("") || (segment.kind === "dynamic" && Array.isArray(value))) {
		throw new Error(segment.name)
	}
	return values.map((text) => encodeParam(text, segment.name))
}

// `.` and `..`, `%2e` counted as a dot, are the dot segments a browser resolves away (BUGS.md 156).
const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i

// A param is encoded by code point, so a character outside the BMP keeps its surrogate pair; a lone surrogate, which no
// URL can carry, is a bad param (plan 21 8.2). A bad value throws naming its key, never the value, which can be request
// data a 500 logs (BUGS.md 308).
export function encodeParam(value: string, name: string): string {
	if (value.includes("/") || value.includes("\\") || DOT_SEGMENT.test(value)) throw new Error(`param ${name}`)
	const chars = Array.from(value)
	let out = ""
	let skip = 0
	for (const [index, char] of chars.entries()) {
		if (skip > 0) {
			skip -= 1
			continue
		}
		if (char !== "%") {
			out += encodeChar(char, name)
			continue
		}
		const hex = chars.slice(index + 1, index + 3).join("")
		if (!isHex(hex.charAt(0)) || !isHex(hex.charAt(1))) throw new Error(`param ${name}`)
		out += `%${hex.toUpperCase()}`
		skip = 2
	}
	return out
}

// One code point. A lone surrogate is the URIError `encodeURIComponent` throws, a bad param here.
function encodeChar(char: string, name: string): string {
	try {
		return encodeURIComponent(char)
	} catch {
		throw new Error(`param ${name}`)
	}
}

function isHex(char: string): boolean {
	return char !== "" && "0123456789ABCDEFabcdef".includes(char)
}
