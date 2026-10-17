import { createComponent } from "solid-js"
import { Dynamic, type JSX } from "@solidjs/web"
import { nonce } from "../csp/nonce.ts"

// Browsers keep view-transition animations under prefers-reduced-motion, so the rule turns them off.
const REDUCED =
	"@media (prefers-reduced-motion:reduce){::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none}}"

// The document transition crossfades: the old root snapshot is kept (B125; where Chrome's capture comes out white,
// Chromium 573693508, an app hides it itself, dx/navigate.md). The overlay passes pointer events through, so what does
// not change keeps hover and clicks while a transition runs where the engine allows (BUGS.md 119.16, B126). The content
// scope's group does not move, so the boundary crossfades in place instead of sliding from its old box (B129). `duration`
// is milliseconds, 150 by default (B125). The tag carries the request nonce, so a nonce CSP allows it (dx/server.md).
export function ViewTransitionCSS(props: { duration?: number }): JSX.Element {
	const value = nonce()
	return createComponent(Dynamic, {
		component: "style",
		nonce: value === "" ? undefined : value,
		get children() {
			const duration = props.duration ?? 150
			// One the browser cannot read, negative or not finite, would drop the declaration (BUGS.md 324).
			if (!Number.isFinite(duration) || duration < 0) {
				throw new Error("ViewTransitionCSS duration is a finite number of milliseconds, at least 0")
			}
			return `@view-transition{navigation:auto}::view-transition{pointer-events:none}::view-transition-group(flare-content){animation:none}::view-transition-old(*),::view-transition-new(*){animation-duration:${duration}ms}${REDUCED}`
		},
	})
}
