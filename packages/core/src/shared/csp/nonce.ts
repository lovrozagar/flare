import { FN_PREFIX } from "../protocol/index.ts";

// `stylesheet` is a document render's: `<Stylesheet />` leaves its href there, and the document writes the markup.
type RequestEvent = { path: string; nonce: string; stylesheet?: StylesheetPlacement };

export type StylesheetPlacement = { href?: string };

const slot: { event: RequestEvent | undefined } = { event: undefined };

export function withRequest<T>(event: RequestEvent, run: () => T): T {
	const previous = slot.event;
	slot.event = event;
	try {
		return run();
	} finally {
		slot.event = previous;
	}
}

export function nonce(): string {
	const fromClient = clientNonce();
	if (fromClient !== undefined) return fromClient;
	return serverNonce();
}

// Workers defines `self` and never assigns `flare`. Only an object `flare` is the client.
function clientNonce(): string | undefined {
	if (typeof globalThis.self === "undefined") return undefined;
	return nonceFrom(globalThis.self);
}

function nonceFrom(scope: object): string | undefined {
	if (!("flare" in scope)) return undefined;
	const flare = scope.flare;
	if (typeof flare !== "object" || flare === null) return undefined;
	if (!("nonce" in flare)) return "";
	if (typeof flare.nonce !== "string") return "";
	return flare.nonce;
}

function serverNonce(): string {
	const event = slot.event;
	if (event === undefined) throw new Error("nonce");
	if (event.path.startsWith(FN_PREFIX)) throw new Error("nonce");
	return event.nonce;
}

// A document render writes the stylesheet markup itself, right after the critical style (B103). `<Stylesheet />` hands
// it the href here and renders nothing in place. Outside a document render, nothing takes it.
export function placeStylesheet(href: string): boolean {
	const placement = slot.event?.stylesheet;
	if (placement === undefined) return false;
	placement.href = href;
	return true;
}
