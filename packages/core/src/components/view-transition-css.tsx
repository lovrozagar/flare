import type { JSX } from "solid-js";
import { useSSRContext } from "./ssr-context.tsx";

/* Duplicated from index.ts to avoid circular import (index re-exports this component) */
function buildViewTransitionCss(duration: number): string {
	return `@view-transition{navigation:auto}::view-transition-old(*),::view-transition-new(*){animation-duration:${duration}ms}`;
}

const DEFAULT_CSS = buildViewTransitionCss(175);

export interface ViewTransitionCSSProps {
	duration?: number;
}

export function ViewTransitionCSS(props: ViewTransitionCSSProps): JSX.Element {
	const ctx = useSSRContext();
	const nonce = ctx?.nonce ?? "";
	const css = props.duration !== undefined ? buildViewTransitionCss(props.duration) : DEFAULT_CSS;

	return (<style innerHTML={css} nonce={nonce} />) as unknown as JSX.Element;
}
