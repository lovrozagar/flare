import type * as web from "@solidjs/web"

// Solid's own render options, so the render passes them through as they are.
export type StreamOptions = NonNullable<Parameters<typeof web.renderToStream>[1]>

// Solid reports each error it handles to `onError`. A fragment that rejected after the shell, for the client to render
// again, goes to `onRenderError`. A render that failed is the slot boundary's to report, before the shell, and a value
// Solid could not serialize is no failed render. Returning nothing keeps Solid's own handling.
export function streamOptions(
	signal: AbortSignal,
	nonce: string,
	onRenderError: ((error: unknown) => void) | undefined,
): StreamOptions {
	const options: StreamOptions = {
		signal,
		manifest: {},
		onError: (error, context) => {
			if (context.kind === "render" && context.handling === "client") onRenderError?.(error)
			return undefined
		},
		onHead: () => undefined,
	}
	if (nonce !== "") options.nonce = nonce
	return options
}
