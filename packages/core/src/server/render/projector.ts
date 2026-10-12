import { isSafeError } from "@solidjs/web";
import { devErrorPayload, statusOf, type DevErrorPayload } from "../../shared/errors/index.ts";
import { createLogger, type Logger } from "../lifecycle/logger.ts";

// The two fields of `import.meta` that B93 reads. Vite replaces `env.DEV`, and `hot` exists only in dev.
export type DevMeta = {
	env: { DEV: boolean };
	hot?: { send: (event: string, payload: unknown) => void } | undefined;
};

export type ErrorSink = { dev: boolean; send?: ((payload: DevErrorPayload) => void) | undefined; log: Logger };

// The `error` of a state match and of an `e` frame (B76, B83): `stack` in dev, `digest` in production.
export type WireError = { name: string; message: string; stack?: string; digest?: string };

// `error` is what errorRender receives. Outside dev its stack is "" (B76).
export type Projected = { status: number; error: Error; wire: WireError };

const GENERIC = "Something went wrong";

export function devSink(meta: DevMeta): ErrorSink {
	const hot = meta.hot;
	const dev = meta.env.DEV;
	const send = hot === undefined ? undefined : (payload: DevErrorPayload) => hot.send("flare:error", payload);
	return { dev, send, log: createLogger({ dev }) };
}

// notFound(), unauthenticated(), unauthorized(), and redirect() are not bugs: no stack, no log, no overlay.
// Any other throw is a bug. Dev shows it and opens the overlay. Production shows a digest and logs only that.
export function projectError(thrown: unknown, sink: ErrorSink): Projected {
	const status = statusOf(thrown);
	const { name, message } = describe(thrown);
	if (status !== 500) return { status, error: rebuilt(name, message, ""), wire: { name, message } };
	if (sink.dev) {
		const payload = devErrorPayload(thrown);
		sink.send?.(payload);
		sink.log.error("render", payload.err.message, payload.err.stack);
		return {
			status,
			error: rebuilt(name, message, payload.err.stack),
			wire: { name, message, stack: payload.err.stack },
		};
	}
	const digest = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
	sink.log.error("render", digest);
	const shown = isSafeError(thrown) ? { name, message } : { name: "Error", message: GENERIC };
	return { status, error: rebuilt(shown.name, shown.message, ""), wire: { ...shown, digest } };
}

function describe(thrown: unknown): { name: string; message: string } {
	if (thrown instanceof Error) return { name: thrown.name, message: thrown.message };
	return { name: "Error", message: String(thrown) };
}

function rebuilt(name: string, message: string, stack: string): Error {
	const error = new Error(message);
	error.name = name;
	error.stack = stack;
	return error;
}
