import { createComponent } from "solid-js"
import { Dynamic, type JSX } from "@solidjs/web"
import { nonce } from "../../../shared/csp/index.ts"
import type { Font } from "./create-font.ts"

export type FontCSSProps = {
	font: Font
	preload?: string | false
	subsets?: readonly string[]
}

function preloadLink(href: string): JSX.Element {
	return createComponent(Dynamic, {
		component: "link",
		rel: "preload",
		as: "font",
		type: "font/woff2",
		crossorigin: "",
		href,
	})
}

// The font's CSS in a style tag that carries the request nonce, then its preload links (dx/features.md Fonts). The
// CSS and the links are read once, so an unknown subset throws while the component renders.
export function FontCSS(props: FontCSSProps): JSX.Element {
	const value = nonce()
	const css = props.font.css(props.subsets)
	const links = props.preload === false ? [] : props.font.preloadLinks(props.preload)
	return [
		createComponent(Dynamic, { component: "style", nonce: value === "" ? undefined : value, children: css }),
		...links.map((link) => preloadLink(link.href)),
	]
}
