/**
 * ResetCSS Component
 *
 * Renders baseline CSS reset styles.
 * Place in <head>.
 */

import type { JSX } from "solid-js"
import { NoHydration } from "solid-js/web"
import { useSSRContext } from "../components/ssr-context"
import { resetCss } from "../server/css"

function ResetCSS(): JSX.Element {
	const ctx = useSSRContext()

	if (!ctx?.isServer) {
		return null as unknown as JSX.Element
	}

	return (
		<NoHydration>
			<style data-testid="reset-css" nonce={ctx.nonce || undefined}>
				{resetCss}
			</style>
		</NoHydration>
	)
}

export { ResetCSS, resetCss }
