import { For, type JSX } from "solid-js";
import { useSSRContext } from "../components/ssr-context.tsx";
import type { Font } from "./types.ts";

export interface FontCSSProps<S extends string> {
	font: Font<S>;
	preload?: S | false;
	subsets?: S[];
}

export function FontCSS<S extends string>(props: FontCSSProps<S>): JSX.Element {
	const ctx = useSSRContext();
	const nonce = ctx?.nonce ?? "";

	const css = props.font.css(props.subsets);

	const preloadLinks = props.preload === false ? [] : props.font.preloadLinks(props.preload ?? undefined);

	return (
		<>
			<style innerHTML={css} nonce={nonce} />
			<For each={preloadLinks}>
				{(link) => <link as="font" crossorigin="" href={link.href} rel="preload" type="font/woff2" />}
			</For>
		</>
	) as unknown as JSX.Element;
}
