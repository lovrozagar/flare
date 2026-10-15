import { patternSegments, type RawParams } from "../../shared/route-tree/index.ts"
import type { PolicyClass } from "../auth/identity.ts"
import { buildId as built } from "../lifecycle/build-info.ts"

// What a key is built from: the route's path pattern names the params in route order, and `params` is the raw
// record the matcher built. There is no search, no identity class segment, and no author key (B32, B73).
export type KeyInput = {
	build: string
	route: string
	pattern: string
	params: Readonly<RawParams>
	class: PolicyClass
}

// The id flare() writes into build-info.ts. Without the plugin, and in dev, it is `dev` (B84).
export function buildId(): string {
	return built
}

// `static:<build>:<routeId>:<rawParams>` (B86). The values follow the route's declared params, never the record's
// key order, so a prerender seed keyed from `params()` and a runtime lookup agree. Every declared param keeps its
// slot, and an absent optional is "", so `/static/x` and `/x/static` on `/[[a]]/static/[[b]]` stay two keys. A
// catch-all joins its segments with `/`, and `/` and `%` inside a value are percent-encoded. Only a route that
// declares no params omits the segment. A required chain is never stored, so it has no key (B27).
export function storeKey(input: KeyInput): string {
	if (input.class === "required") throw new Error(`${input.route}: a required chain is never stored`)
	const names = patternSegments(input.pattern).flatMap((segment) => (segment.kind === "static" ? [] : [segment.name]))
	const head = `static:${input.build}:${input.route}`
	if (names.length === 0) return head
	const values = names.map((name) => [input.params[name] ?? []].flat().map(encode).join("/"))
	return `${head}:${values.join("/")}`
}

function encode(value: string): string {
	return value.replaceAll("%", "%25").replaceAll("/", "%2F")
}
