import type { JSX } from "solid-js";
import { NoHydration } from "solid-js/web";
import type { ThemeConfig } from "../theme.ts";
import { getThemeScript } from "../theme.ts";
import { useSSRContext } from "./ssr-context.tsx";

export interface ThemeScriptProps {
	config?: ThemeConfig;
}

export function ThemeScript(props: ThemeScriptProps): JSX.Element {
	const ctx = useSSRContext();
	const nonce = ctx?.nonce ?? "";
	const config = props.config ?? ctx?.theme;
	const script = getThemeScript(config);

	return (
		<NoHydration>
			<script innerHTML={script} nonce={nonce} />
		</NoHydration>
	) as unknown as JSX.Element;
}
