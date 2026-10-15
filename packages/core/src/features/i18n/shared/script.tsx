import { createComponent, NoHydration } from "solid-js"
import { Dynamic, isServer, type JSX } from "@solidjs/web"
import { nonce, scriptLiteral } from "../../../shared/csp/index.ts"
import { useLocaleState } from "./provider.tsx"

// LocaleScript takes no props. The tag is the provider's.
export type NoProps = Record<string, never>

// One inline script, written by the server with the request nonce, that sets `lang` on `<html>` to the provider's
// tag, over any lang already there. Hydration keeps the server's tag, and a client render writes none. After that the
// provider sets `lang` when the locale changes. Outside LocaleProvider it throws.
export function LocaleScript(_props: NoProps): JSX.Element {
	const state = useLocaleState()
	return createComponent(NoHydration, {
		get children() {
			if (!isServer) return undefined
			const value = nonce()
			return createComponent(Dynamic, {
				component: "script",
				nonce: value === "" ? undefined : value,
				innerHTML: `document.documentElement.lang=${scriptLiteral(state.locale())}`,
			})
		},
	})
}
