import { devErrorPayload, type DevErrorPayload } from "../../shared/errors/index.ts";
import { resolvers } from "../../shared/promise/resolvers.ts";
import { chunksOf, frameDecoder, type Frame } from "../../shared/protocol/index.ts";
import type { HeadConfig } from "../../shared/route-builder/types.ts";
import { errorFromWire } from "../router/store.ts";

// What a data response gives the next commit, by route id. `failure` is a loader `e`. `redirect` is an `x`.
export type Landed = {
	data: Record<string, unknown>;
	heads: Record<string, HeadConfig>;
	failure?: { route: string; status: number; error: Error };
	// A match's preloader context, when its `l` frame carried `p`.
	preloaders?: Record<string, Record<string, unknown>>;
	// A match's `.input()` output, when its `l` frame carried `v`. Without it the raw records apply.
	values?: Record<string, Values>;
	redirect?: { status: number; url: string; replace: boolean };
};

// A landing's end: once the frames after `r` are all read, every deferred value it carries is settled or a hole.
const ends = new WeakMap<Landed, Promise<void>>();

export function endOf(landed: Landed): Promise<void> {
	return ends.get(landed) ?? Promise.resolve();
}

export type Values = { params: unknown; search: unknown };

// `holes` hears that the response ended with placeholders no frame settled: stored `"stream"` holes, which a fill
// request fills. It gets those pending values, and the fill's landing resolves the same ones through `reuse`, because
// a component's read holds the value it was first given (useDeferred). Without `holes`, such a value rejects.
// `signal` is the request's: once it aborts, a newer navigation owns the screen, so the values still pending stay so.
export type LandOptions = {
	dev: boolean;
	send?: ((payload: DevErrorPayload) => void) | undefined;
	holes?: ((pending: Pending) => void) | undefined;
	reuse?: Pending | undefined;
	signal?: AbortSignal | undefined;
};

// The deferred values a landing has not settled yet, by `${route}\n${key}`, and the values a stored page carried
// inline, already settled, which a fill's `kept` reads.
export type Pending = Map<string, PromiseWithResolvers<unknown>>;

type Slots = Pending;

// The slots a stored page filled inline: settled, so never a hole, and never rejected at a landing's end (BUGS.md 94).
const inline = new WeakSet<PromiseWithResolvers<unknown>>();

// A placeholder the client turns into a live deferred value. The promise is a prototype getter, like the
// server's, so the value still serializes as { __deferred, key }.
class ClientDeferred {
	readonly __deferred: true = true;
	readonly key: string;
	readonly hole?: true;
	readonly #promise: Promise<unknown>;

	constructor(key: string, promise: Promise<unknown>, hole: boolean) {
		this.key = key;
		if (hole) this.hole = true;
		this.#promise = promise;
	}

	get promise(): Promise<unknown> {
		return this.#promise;
	}
}

// Resolves at `r`, when the navigation commits, or at `x`. The frames after `r` keep resolving or rejecting
// the deferred values in the background (B80). It takes an iterator, not an iterable: a response body is an iterable
// only where the browser can iterate a stream, which Safari before 27 cannot (BUGS.md 123).
export async function landFrames(frames: AsyncIterator<Frame>, options: LandOptions): Promise<Landed> {
	const landed: Landed = { data: {}, heads: {} };
	const slots: Slots = new Map(options.reuse);
	for (let next = await frames.next(); !next.done; next = await frames.next()) {
		const frame = next.value;
		if (frame.t === "x") return { ...landed, redirect: { status: frame.s, url: frame.u, replace: frame.r } };
		if (frame.t === "r") {
			ends.set(landed, settleLater(frames, { slots, holes: options.holes, signal: options.signal }));
			return landed;
		}
		land(frame, landed, { slots, options });
	}
	throw new Error("The data response ended before r");
}

export async function* framesOf(body: ReadableStream<Uint8Array>): AsyncGenerator<Frame> {
	const decoder = frameDecoder();
	const text = new TextDecoder();
	for await (const chunk of chunksOf(body)) yield* decoder.push(text.decode(chunk, { stream: true }));
}

function land(frame: Frame, landed: Landed, context: { slots: Slots; options: LandOptions }): void {
	if (frame.t === "l") landed.data[frame.m] = revive(frame.d, frame.m, context.slots);
	if (frame.t === "l" && isRecord(frame.p)) landed.preloaders = { ...landed.preloaders, [frame.m]: frame.p };
	if (frame.t === "l" && isRecord(frame.v)) {
		landed.values = { ...landed.values, [frame.m]: { params: frame.v["params"], search: frame.v["search"] } };
	}
	if (frame.t === "h") landed.heads[frame.m] = frame.d;
	if (frame.t === "e") {
		// A loader `e` is a bug the dev overlay shows. A deferred `e` reaches it only through errorRender.
		const wire = frame.e;
		if (context.options.dev) context.options.send?.(devErrorPayload(errorFromWire(wire).error));
		landed.failure = { route: frame.m, ...errorFromWire(wire) };
	}
}

async function settleLater(
	frames: AsyncIterator<Frame>,
	{ slots, holes, signal }: Pick<LandOptions, "holes" | "signal"> & { slots: Slots },
): Promise<void> {
	try {
		for (let next = await frames.next(); !next.done; next = await frames.next()) {
			const frame = next.value;
			if (frame.t === "c") {
				slots.get(`${frame.m}\n${frame.k}`)?.resolve(frame.d);
				slots.delete(`${frame.m}\n${frame.k}`);
			}
			if (frame.t === "e" && frame.k !== undefined) {
				slots.get(`${frame.m}\n${frame.k}`)?.reject(errorFromWire(frame.e).error);
				slots.delete(`${frame.m}\n${frame.k}`);
			}
		}
	} catch (error) {
		// The body broke after `r`. Nothing escapes as an unhandled rejection (B105). A newer navigation aborted it, so
		// the page that shows these values is leaving and they stay pending. Otherwise each one rejects with the reason.
		if (signal?.aborted !== true) for (const slot of slots.values()) slot.reject(error);
		return;
	}
	// A value whose frame never came is a stored hole the fill fills. Without a fill it rejects, never waiting forever.
	// The fill gets the inline values too, which its `kept` values read.
	const open = [...slots.values()].filter((slot) => !inline.has(slot));
	if (open.length > 0 && holes !== undefined) return holes(slots);
	for (const slot of open) slot.reject(new Error("The data response ended before this value"));
}

// Each placeholder in a match's data becomes a live deferred value whose slot a later frame settles. A slot already in
// `slots`, a hole a fill is filling, is reused, so every read of that value sees the one promise. A stored page's
// inline value settles its slot at once. A fill's `kept` value reads the slot the page already holds for it, and one
// the page does not hold rejects with a reason that names it (BUGS.md 94).
export function revive(value: unknown, route: string, slots: Pending): unknown {
	if (Array.isArray(value)) return value.map((item) => revive(item, route, slots));
	if (typeof value !== "object" || value === null) return value;
	if ("__deferred" in value && value.__deferred === true && "key" in value && typeof value.key === "string") {
		const id = `${route}\n${value.key}`;
		if ("kept" in value && value.kept === true)
			return new ClientDeferred(value.key, keptOf(slots, id, value.key), false);
		const slot = slots.get(id) ?? resolvers<unknown>();
		slot.promise.catch(() => undefined);
		slots.set(id, slot);
		if ("value" in value) {
			slot.resolve(value.value);
			inline.add(slot);
		}
		return new ClientDeferred(value.key, slot.promise, "hole" in value && value.hole === true);
	}
	return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, revive(item, route, slots)]));
}

function keptOf(slots: Pending, id: string, key: string): Promise<unknown> {
	const slot = slots.get(id);
	if (slot !== undefined) return slot.promise;
	const route = id.slice(0, id.indexOf("\n"));
	const missing = Promise.reject(new Error(`The fill kept "${key}" of ${route}, which the page does not hold`));
	missing.catch(() => undefined);
	return missing;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
