/**
 * ViewTransitionCSS Component
 *
 * Renders View Transitions API styles for smooth SPA navigation.
 * Place in <head>.
 */

import type { JSX } from "solid-js"
import { NoHydration } from "solid-js/web"
import { useSSRContext } from "../components/ssr-context"

interface ViewTransitionCSSProps {
	/** Animation duration in milliseconds @default 175 */
	duration?: number
}

function getViewTransitionCss(duration: number): string {
	return `@view-transition{navigation:auto}::view-transition-old(*),::view-transition-new(*){animation-duration:${duration}ms}`
}

const viewTransitionCss = getViewTransitionCss(175)

function ViewTransitionCSS(props: ViewTransitionCSSProps): JSX.Element {
	const ctx = useSSRContext()

	if (!ctx?.isServer) {
		return null as unknown as JSX.Element
	}

	const css = props.duration ? getViewTransitionCss(props.duration) : viewTransitionCss

	return (
		<NoHydration>
			<style data-testid="view-transition-css" nonce={ctx.nonce || undefined}>
				{css}
			</style>
		</NoHydration>
	)
}

export { getViewTransitionCss, ViewTransitionCSS, viewTransitionCss }
export type { ViewTransitionCSSProps }
