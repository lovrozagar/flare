type RequestEvent = { path: string; nonce: string };

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
	if (event.path.startsWith("/_flare/fn/")) throw new Error("nonce");
	return event.nonce;
}
