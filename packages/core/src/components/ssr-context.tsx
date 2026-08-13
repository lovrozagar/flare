import { createContext, type JSX, sharedConfig, useContext } from "solid-js"
import type { DirectionConfig } from "../direction.ts"
import type { LocaleConfig } from "../locale/index.tsx"
import type { HeadConfig } from "../route-builder/types.ts"
import type { ThemeConfig } from "../theme.ts"

export interface SSRContextValue {
	direction?: DirectionConfig
	entryScript?: string
	flareStateScript: string
	isServer: boolean
	locale?: LocaleConfig
	nonce: string
	resolvedHead?: HeadConfig
	theme?: ThemeConfig
}

const SSRCtx = createContext<SSRContextValue>()

export function setSSRContext(value: SSRContextValue): void {
	if (sharedConfig.context) {
		;(sharedConfig.context as Record<string, unknown>).flare = value
	}
}

export function useSSRContext(): SSRContextValue | undefined {
	/* SSR path: read from sharedConfig.context */
	if (sharedConfig.context) {
		return (sharedConfig.context as Record<string, unknown>).flare as SSRContextValue | undefined
	}
	/* Testing fallback: read from Solid context provider */
	return useContext(SSRCtx)
}

export function SSRContextProvider(props: {
	children: JSX.Element
	value: SSRContextValue
}): JSX.Element {
	return <SSRCtx.Provider value={props.value}>{props.children}</SSRCtx.Provider>
}
