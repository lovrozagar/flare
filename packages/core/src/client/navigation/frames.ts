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

// `holes` hears that the response ended with placeholders no frame settled: stored `"stream"` holes, which a fill
// request fills. It gets those pending values, and the fill's landing resolves the same ones through `reuse`, because
// a component's read holds the value it was first given (useDeferred). Without `holes`, such a value rejects.
export type LandOptions = {
	dev: boolean;
	send?: ((payload: DevErrorPayload) => void) | undefined;
	holes?: ((pending: Pending) => void) | undefined;
	reuse?: Pending | undefined;
};

// The deferred values a landing has not settled yet, by `${route}\n${key}`.
export type Pending = Map<string, PromiseWithResolvers<unknown>>;

type Slots = Pending;

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
// the deferred values in the background (B80).
export async function landFrames(source: AsyncIterable<Frame>, options: LandOptions): Promise<Landed> {
	const landed: Landed = { data: {}, heads: {} };
	const slots: Slots = new Map(options.reuse);
	const frames = source[Symbol.asyncIterator]();
	for (let next = await frames.next(); !next.done; next = await frames.next()) {
		const frame = next.value;
		if (frame.t === "x") return { ...landed, redirect: { status: frame.s, url: frame.u, replace: frame.r } };
		if (frame.t === "r") {
			void settleLater(frames, { slots, holes: options.holes });
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
	{ slots, holes }: { slots: Slots; holes: ((pending: Pending) => void) | undefined },
): Promise<void> {
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
	// A value whose frame never came is a stored hole the fill fills. Without a fill it rejects, never waiting forever.
	if (slots.size > 0 && holes !== undefined) return holes(slots);
	for (const slot of slots.values()) slot.reject(new Error("The data response ended before this value"));
}

// Each placeholder in a match's data becomes a live deferred value whose slot a later frame settles. A slot already in
// `slots`, a hole a fill is filling, is reused, so every read of that value sees the one promise.
export function revive(value: unknown, route: string, slots: Pending): unknown {
	if (Array.isArray(value)) return value.map((item) => revive(item, route, slots));
	if (typeof value !== "object" || value === null) return value;
	if ("__deferred" in value && value.__deferred === true && "key" in value && typeof value.key === "string") {
		const id = `${route}\n${value.key}`;
		const slot = slots.get(id) ?? Promise.withResolvers<unknown>();
		slot.promise.catch(() => undefined);
		slots.set(id, slot);
		return new ClientDeferred(value.key, slot.promise, "hole" in value && value.hole === true);
	}
	return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, revive(item, route, slots)]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
