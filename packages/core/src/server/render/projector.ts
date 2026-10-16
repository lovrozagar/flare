import { isSafeError } from "@solidjs/web"
import { devErrorPayload, statusOf, type DevErrorPayload } from "../../shared/errors/index.ts"
import type { DevStyle } from "../../shared/protocol/index.ts"
import { createLogger, type Logger } from "../lifecycle/logger.ts"
import { stylesClient } from "./dev-styles.ts"

// The two fields of `import.meta` that B93 reads. Vite replaces `env.DEV`, and `hot` exists only in dev.
export type DevMeta = {
	env: { DEV: boolean }
	hot?:
		| {
				send: (event: string, payload: unknown) => void
				on?: (event: string, listener: (payload: unknown) => void) => void
				data?: object
		  }
		| undefined
}

type Send = (payload: DevErrorPayload) => void

// `toTab` binds the sender to one request's dev tab token, so its payload opens the overlay in that tab (B42).
export type ErrorSink = {
	dev: boolean
	send?: Send | undefined
	toTab?: ((token: string | undefined) => Send) | undefined
	log: Logger
	// The CSS modules a matched chain imports, from the dev server, for the dev document's first paint (B104).
	styles?: ((routes: readonly string[]) => Promise<DevStyle[]>) | undefined
}

// The `error` of a state match and of an `e` frame (B76, B83): `stack` in dev, `digest` in production.
export type WireError = { name: string; message: string; stack?: string; digest?: string }

// `error` is what errorRender receives. Outside dev its stack is "" (B76).
export type Projected = { status: number; error: Error; wire: WireError }

const GENERIC = "Something went wrong"

// `styles` is the dev styles client; by default one made over this hot context (B104).
export function devSink(meta: DevMeta, styles: ErrorSink["styles"] = devStyles(meta.hot)): ErrorSink {
	const hot = meta.hot
	const dev = meta.env.DEV
	const log = createLogger({ dev })
	if (hot === undefined) return { dev, log }
	const toTab =
		(token: string | undefined): Send =>
		(payload) =>
			hot.send("flare:error", { token, payload })
	if (styles === undefined) return { dev, send: toTab(undefined), toTab, log }
	return { dev, send: toTab(undefined), toTab, log, styles }
}

// The dev styles client over a hot context that can listen; none without one. Vite's hot context reads its own state,
// so both calls keep `hot` as their receiver.
export function devStyles(hot: DevMeta["hot"]): ErrorSink["styles"] {
	const on = hot?.on
	if (hot === undefined || on === undefined) return undefined
	const channel = {
		send: (event: string, payload: unknown) => hot.send(event, payload),
		on: (event: string, listener: (payload: unknown) => void) => void Reflect.apply(on, hot, [event, listener]),
		data: hot.data,
	}
	return stylesClient(channel, (message) => createLogger({ dev: true }).warn("styles", message))
}

// One request's sink: its payloads go to the dev tab its token names (dx/plugin.md, B42). A production sink has no
// `toTab`.
export function requestSink(sink: ErrorSink, token: string | undefined): ErrorSink {
	if (sink.toTab === undefined) return sink
	return { ...sink, send: sink.toTab(token) }
}

// notFound(), unauthenticated(), unauthorized(), and redirect() are not bugs: no stack, no log, no overlay.
// Any other throw is a bug. Dev shows it and opens the overlay. Production shows a digest and logs only that.
export function projectError(thrown: unknown, sink: ErrorSink): Projected {
	const status = statusOf(thrown)
	const { name, message } = describe(thrown)
	if (status !== 500) return { status, error: rebuilt(name, message, ""), wire: { name, message } }
	if (sink.dev) {
		const payload = devErrorPayload(thrown)
		sink.send?.(payload)
		sink.log.error("render", payload.err.message, payload.err.stack)
		return {
			status,
			error: rebuilt(name, message, payload.err.stack),
			wire: { name, message, stack: payload.err.stack },
		}
	}
	const digest = crypto.randomUUID().replaceAll("-", "").slice(0, 12)
	// The server log carries the error itself beside the digest the client sees, so an operator ties a 500 to its cause
	// (B76, BUGS.md 158). The stack opens with the name and message; a thrown non-Error has neither, so both are written.
	const stack = thrown instanceof Error && thrown.stack !== undefined ? thrown.stack : `${name}: ${message}`
	sink.log.error("render", digest, stack)
	const shown = isSafeError(thrown) ? { name, message } : { name: "Error", message: GENERIC }
	return { status, error: rebuilt(shown.name, shown.message, ""), wire: { ...shown, digest } }
}

function describe(thrown: unknown): { name: string; message: string } {
	if (thrown instanceof Error) return { name: thrown.name, message: thrown.message }
	return { name: "Error", message: String(thrown) }
}

function rebuilt(name: string, message: string, stack: string): Error {
	const error = new Error(message)
	error.name = name
	error.stack = stack
	return error
}
