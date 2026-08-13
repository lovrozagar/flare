/**
 * ThemeScript Component
 *
 * Renders blocking inline script to prevent theme flash.
 * Place in <head> before stylesheets.
 */

import type { JSX } from "solid-js"
import { NoHydration } from "solid-js/web"
import { useSSRContext } from "../components/ssr-context"
import { getThemeScript, type ThemeConfig } from "../theme"

type ThemeScriptProps = ThemeConfig

function ThemeScript(props: ThemeScriptProps): JSX.Element {
	const ctx = useSSRContext()

	if (!ctx?.isServer) {
		return null as unknown as JSX.Element
	}

	const script = getThemeScript(props)

	return (
		<NoHydration>
			<script data-testid="theme-script" nonce={ctx.nonce || undefined}>
				{script}
			</script>
		</NoHydration>
	)
}

export { ThemeScript }
export type { ThemeScriptProps }
