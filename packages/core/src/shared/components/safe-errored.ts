import { createComponent, Errored } from "solid-js"
import { escape, isServer, type JSX } from "@solidjs/web"

type ErroredProps = Parameters<typeof Errored>[0]

// Solid's `Errored` for every Flare boundary. On the server, Solid 2's `Errored` writes a string child as raw HTML,
// where an element, a context provider, and `Loading` escape it (BUGS.md 141, https://github.com/solidjs/solid/issues/4116). So the children pass through Solid's
// own `escape` first: a string is escaped, an array is copied with its strings escaped, a function is escaped when it
// runs, and an SSR node passes untouched. The browser inserts a string as a text node, so the client is unchanged.
// A structure test keeps every other import of `Errored` out of src.
export function SafeErrored(props: ErroredProps): JSX.Element {
	return createComponent(Errored, {
		get fallback() {
			return props.fallback
		},
		get children() {
			return isServer ? (escape(props.children) as JSX.Element) : props.children
		},
	})
}
