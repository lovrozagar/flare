import { createComponent, NoHydration } from "solid-js"
import { Dynamic, isServer, type JSX } from "@solidjs/web"
import { nonce, scriptLiteral } from "../../../shared/csp/index.ts"
import { useRouter, type Dir, type DirectionConfig } from "../../../shared/router/index.ts"
import { dirOf } from "./script-of.ts"

// The locale is the route param the layout also passes to LocaleProvider, or omitted (dx/features.md Direction).
export type DirectionProps = { locale?: string | undefined }

// The before-paint steps: a stored ltr or rtl wins, else the dir this render computed from the locale. `dir` is set,
// and a data-* attribute too when the config names one. The script does not call Intl.
function directionCode(config: DirectionConfig, fallback: Dir): string {
	const key = scriptLiteral(config.storageKey)
	const name = scriptLiteral(config.attribute)
	return (
		`(function(){var v=null;try{v=localStorage.getItem(${key})}catch(e){}` +
		`if(v!="ltr"&&v!="rtl")v=${scriptLiteral(fallback)};` +
		`var r=document.documentElement;r.setAttribute("dir",v);r.setAttribute(${name},v)})()`
	)
}

// The router's direction config. Rendering a direction component without one is an app bug.
export function directionConfigOf(component: string): DirectionConfig {
	const config = useRouter().direction
	if (config === undefined) throw new Error(`${component} needs createRouter({ direction })`)
	return config
}

// One inline script in the document head, written by the server with the request nonce. Hydration keeps the server's
// tag, and a client render writes none, so the document holds one.
export function DirectionScript(props: DirectionProps): JSX.Element {
	const config = directionConfigOf("DirectionScript")
	return createComponent(NoHydration, {
		get children() {
			if (!isServer) return undefined
			const value = nonce()
			return createComponent(Dynamic, {
				component: "script",
				nonce: value === "" ? undefined : value,
				innerHTML: directionCode(config, dirOf(props.locale, config.defaultDir)),
			})
		},
	})
}
