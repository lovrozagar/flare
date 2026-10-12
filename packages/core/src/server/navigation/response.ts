import { encodeFrame, type Frame, type FrameError } from "../../shared/protocol/index.ts";
import type { LoaderFrame } from "../loaders/cascade.ts";
import type { DeferredFrame } from "../loaders/run.ts";

export const NDJSON = "application/x-ndjson";

export type DataBody = {
	loaded: readonly LoaderFrame[];
	heads: readonly Frame[];
	deferred: readonly DeferredFrame[];
	project: (error: unknown) => FrameError;
};

const encoder = new TextEncoder();

// The 02-system order: `l` and the loader `e`, then `h`, then `r`, then each `c` or deferred `e` when its
// promise settles, so a slow one never holds a fast one, then `d` after the last. A deferred rejection does
// not cancel the others (B80).
export function dataBody(body: DataBody): ReadableStream<Uint8Array> {
	const state = { closed: false };
	return new ReadableStream<Uint8Array>({
		start(controller) {
			const write = (frame: Frame): void => {
				if (!state.closed) controller.enqueue(encoder.encode(encodeFrame(frame)));
			};
			// JSON has no undefined: a match with no loader carries `d: null`, as the state script does.
			for (const frame of body.loaded)
				write(frame.t === "e" ? { t: "e", m: frame.m, e: body.project(frame.e) } : { ...frame, d: frame.d ?? null });
			body.heads.forEach(write);
			write({ t: "r" });
			const settled = body.deferred.map(({ m, k, promise }) =>
				promise.then(
					(d) => write({ t: "c", m, k, d }),
					(error: unknown) => write({ t: "e", m, k, e: body.project(error) }),
				),
			);
			void Promise.all(settled).then(() => {
				write({ t: "d" });
				if (!state.closed) controller.close();
			});
		},
		cancel() {
			state.closed = true;
		},
	});
}

// A redirect replaces the whole body with one `x` line. The HTTP status stays 200 (02-system).
export function redirectBody(redirect: { s: number; u: string; r: boolean }): string {
	return encodeFrame({ t: "x", ...redirect });
}
