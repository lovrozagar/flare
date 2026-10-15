import { createComponent, NoHydration } from "solid-js"
import { Dynamic, isServer, type JSX } from "@solidjs/web"
import { nonce, scriptLiteral } from "../../../shared/csp/index.ts"
import { useRouter, type ThemeConfig } from "../../../shared/router/index.ts"

// ThemeScript takes no props. The config is the router's (dx/router.md).
export type NoProps = Record<string, never>

// The before-paint steps (dx/features.md Theme): the stored value, else the default; `system` follows the media
// query; the attribute and `colorScheme` get "light" or "dark". A storage or style throw is ignored. The text holds
// no `<` and no `&`, and each config value is an escaped literal.
function themeCode(config: ThemeConfig): string {
	const key = scriptLiteral(config.storageKey)
	const themes = scriptLiteral(config.themes)
	const fallback = scriptLiteral(config.defaultTheme)
	const name = scriptLiteral(config.attribute)
	return (
		`(function(){var v=null;try{v=localStorage.getItem(${key})}catch(e){}` +
		`if(${themes}.indexOf(v)==-1)v=${fallback};` +
		`if(v=="system")v=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";` +
		`var r=document.documentElement;r.setAttribute(${name},v);try{r.style.colorScheme=v}catch(e){}})()`
	)
}

// The router's theme config. Rendering a theme component without one is an app bug.
export function themeConfigOf(component: string): ThemeConfig {
	const config = useRouter().theme
	if (config === undefined) throw new Error(`${component} needs createRouter({ theme })`)
	return config
}

// One inline script in the document head, written by the server with the request nonce. Hydration keeps the server's
// tag, and a client render writes none, so the document holds one.
export function ThemeScript(_props: NoProps): JSX.Element {
	const config = themeConfigOf("ThemeScript")
	return createComponent(NoHydration, {
		get children() {
			if (!isServer) return undefined
			const value = nonce()
			return createComponent(Dynamic, {
				component: "script",
				nonce: value === "" ? undefined : value,
				innerHTML: themeCode(config),
			})
		},
	})
}
