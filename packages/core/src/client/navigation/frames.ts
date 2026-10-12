import { devErrorPayload, type DevErrorPayload } from "../../shared/errors/index.ts";
import { frameDecoder, type Frame } from "../../shared/protocol/index.ts";
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

export type Values = { params: unknown; search: unknown };

export type LandOptions = { dev: boolean; send?: (payload: DevErrorPayload) => void };

type Slots = Map<string, PromiseWithResolvers<unknown>>;

// A placeholder the client turns into a live deferred value. The promise is a prototype getter, like the
// server's, so the value still serializes as { __deferred, key }.
class ClientDeferred {
	readonly __deferred: true = true;
	readonly key: string;
	readonly #promise: Promise<unknown>;

	constructor(key: string, promise: Promise<unknown>) {
		this.key = key;
		this.#promise = promise;
	}

	get promise(): Promise<unknown> {
		return this.#promise;
	}
}

// Resolves at `r`, when the navigation commits, or at `x`. The frames after `r` keep resolving or rejecting
// the deferred values in the background (B80).
export async function landFrames(source: AsyncIterable<Frame>, options: LandOptions): Promise<Landed> {
	const landed: Landed = { data: {}, heads: {} };
	const slots: Slots = new Map();
	const frames = source[Symbol.asyncIterator]();
	for (let next = await frames.next(); !next.done; next = await frames.next()) {
		const frame = next.value;
		if (frame.t === "x") return { ...landed, redirect: { status: frame.s, url: frame.u, replace: frame.r } };
		if (frame.t === "r") {
			void settleLater(frames, slots);
			return landed;
		}
		land(frame, landed, { slots, options });
	}
	throw new Error("The data response ended before r");
}

export async function* framesOf(body: ReadableStream<Uint8Array>): AsyncIterable<Frame> {
	const decoder = frameDecoder();
	const text = new TextDecoder();
	for await (const chunk of body) yield* decoder.push(text.decode(chunk, { stream: true }));
}

function land(frame: Frame, landed: Landed, context: { slots: Slots; options: LandOptions }): void {
	if (frame.t === "l") landed.data[frame.m] = withDeferreds(frame.d, frame.m, context.slots);
	if (frame.t === "l" && isRecord(frame.p)) landed.preloaders = { ...landed.preloaders, [frame.m]: frame.p };
	if (frame.t === "l" && isRecord(frame.v)) {
		landed.values = { ...landed.values, [frame.m]: { params: frame.v.params, search: frame.v.search } };
	}
	if (frame.t === "h") landed.heads[frame.m] = frame.d;
	if (frame.t === "e") {
		// A loader `e` is a bug the dev overlay shows. A deferred `e` reaches it only through errorRender.
		const wire = frame.e;
		if (context.options.dev) context.options.send?.(devErrorPayload(errorFromWire(wire).error));
		landed.failure = { route: frame.m, ...errorFromWire(wire) };
	}
}

async function settleLater(frames: AsyncIterator<Frame>, slots: Slots): Promise<void> {
	for (let next = await frames.next(); !next.done; next = await frames.next()) {
		const frame = next.value;
		if (frame.t === "c") slots.get(`${frame.m}\n${frame.k}`)?.resolve(frame.d);
		if (frame.t === "e" && frame.k !== undefined)
			slots.get(`${frame.m}\n${frame.k}`)?.reject(errorFromWire(frame.e).error);
	}
	// A value whose frame never came rejects instead of waiting forever.
	for (const slot of slots.values()) slot.reject(new Error("The data response ended before this value"));
}

function withDeferreds(value: unknown, route: string, slots: Slots): unknown {
	if (Array.isArray(value)) return value.map((item) => withDeferreds(item, route, slots));
	if (typeof value !== "object" || value === null) return value;
	if ("__deferred" in value && value.__deferred === true && "key" in value && typeof value.key === "string") {
		const slot = Promise.withResolvers<unknown>();
		slot.promise.catch(() => undefined);
		slots.set(`${route}\n${value.key}`, slot);
		return new ClientDeferred(value.key, slot.promise);
	}
	return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withDeferreds(item, route, slots)]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
