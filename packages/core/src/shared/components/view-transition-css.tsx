import { createComponent } from "solid-js";
import { Dynamic, type JSX } from "@solidjs/web";
import { nonce } from "../csp/nonce.ts";

// Browsers keep view-transition animations under prefers-reduced-motion, so the rule turns them off.
const REDUCED =
	"@media (prefers-reduced-motion:reduce){::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none}}";

// The document transition's old snapshot is hidden, so the new page fades in over the page: in Chrome on some Linux
// compositor and GPU combinations the old root snapshot comes out fully white (Chromium 573693508, BUGS.md 119.15,
// B125). Only the root group: an app's named groups keep both images. The overlay passes pointer events through, so
// what does not change keeps hover and clicks while a transition runs (BUGS.md 119.16, B126). `duration` is milliseconds, 150 by default (B125).
// The tag carries the request nonce, so a nonce CSP allows it (dx/server.md).
export function ViewTransitionCSS(props: { duration?: number }): JSX.Element {
	const value = nonce();
	return createComponent(Dynamic, {
		component: "style",
		nonce: value === "" ? undefined : value,
		get children() {
			const duration = props.duration ?? 150;
			return `@view-transition{navigation:auto}::view-transition-old(root){display:none}::view-transition{pointer-events:none}::view-transition-old(*),::view-transition-new(*){animation-duration:${duration}ms}${REDUCED}`;
		},
	});
}
