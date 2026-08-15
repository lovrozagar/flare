import type { JSX } from "solid-js";
import { NoHydration } from "solid-js/web";
import type { DirectionConfig } from "../direction.ts";
import { getDirectionScript } from "../direction.ts";
import { useSSRContext } from "./ssr-context.tsx";

export interface DirectionScriptProps {
	config?: DirectionConfig;
}

export function DirectionScript(props: DirectionScriptProps): JSX.Element {
	const ctx = useSSRContext();
	const nonce = ctx?.nonce ?? "";
	const config = props.config ?? ctx?.direction;
	const script = getDirectionScript(config);

	return (
		<NoHydration>
			<script innerHTML={script} nonce={nonce} />
		</NoHydration>
	) as unknown as JSX.Element;
}
