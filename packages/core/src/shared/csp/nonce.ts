import { getRequestEvent } from "@solidjs/web"
import { FN_PREFIX, type DevStyle } from "../protocol/index.ts"

// `stylesheet` is a document render's: `<Stylesheet />` leaves its href there, and the document writes the markup.
// `devStyles` are a dev document's CSS modules, which `<Stylesheet />` writes in its place (B104).
type RequestEvent = {
	path: string
	nonce: string
	stylesheet?: StylesheetPlacement
	devStyles?: readonly DevStyle[] | undefined
	// Set by the render's first `<Stylesheet />`: a second renders nothing (BUGS.md 481).
	stylesheetClaimed?: boolean
}

export type StylesheetPlacement = { href?: string }

const slot: { event: RequestEvent | undefined } = { event: undefined }

// Where the render's event also waits on Solid's request event, which a fragment that renders after an async boundary
// still runs under, after the synchronous pass has left `slot` (plan 21 3.13).
const LOCALS_KEY = "flare.render"

export function withRequest<T>(event: RequestEvent, run: () => T): T {
	const locals = getRequestEvent()?.locals
	if (locals !== undefined) Reflect.set(locals, LOCALS_KEY, event)
	const previous = slot.event
	slot.event = event
	try {
		return run()
	} finally {
		slot.event = previous
	}
}

// The render's event: the synchronous pass's, else the one its request event holds.
function current(): RequestEvent | undefined {
	if (slot.event !== undefined) return slot.event
	const held: unknown = Reflect.get(Object(getRequestEvent()?.locals), LOCALS_KEY)
	return typeof held === "object" && held !== null ? (held as RequestEvent) : undefined
}

export function nonce(): string {
	const fromClient = clientNonce()
	if (fromClient !== undefined) return fromClient
	return serverNonce()
}

// Workers defines `self` and never assigns `flare`. Only an object `flare` is the client.
function clientNonce(): string | undefined {
	if (typeof globalThis.self === "undefined") return undefined
	return nonceFrom(globalThis.self)
}

function nonceFrom(scope: object): string | undefined {
	if (!("flare" in scope)) return undefined
	const flare = scope.flare
	if (typeof flare !== "object" || flare === null) return undefined
	if (!("nonce" in flare)) return ""
	if (typeof flare.nonce !== "string") return ""
	return flare.nonce
}

function serverNonce(): string {
	const event = current()
	if (event === undefined) throw new Error("nonce")
	if (event.path.startsWith(FN_PREFIX)) throw new Error("nonce")
	return event.nonce
}

// A document render writes the stylesheet markup itself, right after the critical style (B103). `<Stylesheet />` hands
// it the href here and renders nothing in place. Outside a document render, nothing takes it.
export function placeStylesheet(href: string): boolean {
	const placement = current()?.stylesheet
	if (placement === undefined) return false
	placement.href = href
	return true
}

// The render's first `<Stylesheet />` claims it: true for that one, false for a later one, and undefined outside a
// document render, where the component keeps its own claim (BUGS.md 481).
export function claimStylesheet(): boolean | undefined {
	const event = current()
	if (event === undefined) return undefined
	if (event.stylesheetClaimed === true) return false
	event.stylesheetClaimed = true
	return true
}

// A dev document's CSS modules, in import order. Outside a dev document render there are none.
export function devStyles(): readonly DevStyle[] {
	return current()?.devStyles ?? []
}
