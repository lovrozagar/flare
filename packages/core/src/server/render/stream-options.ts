import { isSafeError } from "@solidjs/web"
import type * as web from "@solidjs/web"
import { statusOf } from "../../shared/errors/index.ts"

// Solid's own render options, so the render passes them through as they are.
export type StreamOptions = NonNullable<Parameters<typeof web.renderToStream>[1]>

// Solid reports each error it handles to `onError`. A fragment that rejected after the shell, for the client to render
// again, goes to `onRenderError`. A render that failed is the slot boundary's to report, before the shell, and a value
// Solid could not serialize is no failed render; what a render error becomes is `inPlace`'s.
export function streamOptions(
	signal: AbortSignal,
	nonce: string,
	onRenderError: ((error: unknown) => void) | undefined,
): StreamOptions {
	const options: StreamOptions = {
		signal,
		manifest: {},
		onError: (error, context) => {
			if (context.kind !== "render") return undefined
			if (context.handling === "client") onRenderError?.(error)
			return inPlace(error)
		},
		onHead: () => undefined,
	}
	if (nonce !== "") options.nonce = nonce
	return options
}

// per-process-constant: the value a render threw behind each generic error `inPlace` handed Solid (BUGS.md 217)
const behind = new WeakMap<object, unknown>()

// Solid's production server build sanitizes a render-phase throw before Flare sees it, so a notFound() thrown in render
// became a 500 and a bug's log line lost its message. Solid uses what `onError` returns: a named status passes as
// itself, being the app's answer; a safe error keeps Solid's handling; a bug becomes a fresh generic error, which the
// client sees as it would Solid's own, tied to the thrown value so the projector logs that (B76, B93, BUGS.md 217).
function inPlace(error: unknown): unknown {
	if (isSafeError(error)) return undefined
	if (statusOf(error) !== 500) return error
	const shown = new Error("Internal Server Error")
	behind.set(shown, error)
	return shown
}

// The value a render threw, for an error `inPlace` stood in for it; anything else as it is.
export function thrownBehind(value: unknown): unknown {
	return typeof value === "object" && value !== null && behind.has(value) ? behind.get(value) : value
}
