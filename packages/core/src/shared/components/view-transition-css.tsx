import { createComponent } from "solid-js";
import { Dynamic, type JSX } from "@solidjs/web";
import { nonce } from "../csp/nonce.ts";

// Browsers keep view-transition animations under prefers-reduced-motion, so the rule turns them off.
const REDUCED =
	"@media (prefers-reduced-motion:reduce){::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none}}";

// `duration` is milliseconds. The tag carries the request nonce, so a nonce CSP allows it (dx/server.md).
export function ViewTransitionCSS(props: { duration?: number }): JSX.Element {
	const value = nonce();
	return createComponent(Dynamic, {
		component: "style",
		nonce: value === "" ? undefined : value,
		get children() {
			const duration = props.duration ?? 175;
			return `@view-transition{navigation:auto}::view-transition-old(*),::view-transition-new(*){animation-duration:${duration}ms}${REDUCED}`;
		},
	});
}
