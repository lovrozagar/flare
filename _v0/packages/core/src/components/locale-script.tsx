import type { JSX } from "@solidjs/web";
import { NoHydration } from "@solidjs/web";
import type { LocaleConfig } from "../locale/index.tsx";
import { getLocaleScript } from "../locale/index.tsx";
import { useSSRContext } from "./ssr-context.tsx";

export interface LocaleScriptProps {
	config?: LocaleConfig;
}

export function LocaleScript(props: LocaleScriptProps): JSX.Element {
	const ctx = useSSRContext();
	const nonce = ctx?.nonce ?? "";
	const config = props.config ?? ctx?.locale;
	if (!config)
		throw new Error(
			"LocaleScript requires a config prop or locale in SSRContext. Pass <LocaleScript config={...} /> or set locale via router.locale().",
		);
	const script = getLocaleScript(config);

	return (
		<NoHydration>
			<script innerHTML={script} nonce={nonce} />
		</NoHydration>
	) as unknown as JSX.Element;
}
