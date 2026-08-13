import type { JSX } from "solid-js"
import type { ThemeConfig } from "../theme.ts"
import { getThemeScript } from "../theme.ts"
import { useSSRContext } from "./ssr-context.tsx"

export interface ThemeScriptProps {
	config?: ThemeConfig
}

export function ThemeScript(props: ThemeScriptProps): JSX.Element {
	const ctx = useSSRContext()
	const nonce = ctx?.nonce ?? ""
	const config = props.config ?? ctx?.theme
	const script = getThemeScript(config)

	return (<script innerHTML={script} nonce={nonce} />) as unknown as JSX.Element
}
