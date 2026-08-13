import type { JSX } from "solid-js"
import type { DirectionConfig } from "../direction.ts"
import { getDirectionScript } from "../direction.ts"
import { useSSRContext } from "./ssr-context.tsx"

export interface DirectionScriptProps {
	config?: DirectionConfig
}

export function DirectionScript(props: DirectionScriptProps): JSX.Element {
	const ctx = useSSRContext()
	const nonce = ctx?.nonce ?? ""
	const config = props.config ?? ctx?.direction
	const script = getDirectionScript(config)

	return (<script innerHTML={script} nonce={nonce} />) as unknown as JSX.Element
}
