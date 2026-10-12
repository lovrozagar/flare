import { useHead, type JSX } from "@solidjs/web";
import type { HeadTag } from "../../shared/head/index.ts";
import type { HeadConfig } from "../../shared/route-builder/types.ts";

// The route .head() result. The type lives beside the builder that returns it.
export type Head = HeadConfig;

// Passes the merged .head() results to Solid's useHead inside the render (B1, B83). Solid escapes the values,
// rewrites a script or style close, and stamps each tag's `data-dh` identity, so the client's useHead adopts
// these elements instead of writing second copies.
// renderDocument builds `tags` before the render, so a bad head fails before the shell.
export function DocumentHead(props: { tags: readonly HeadTag[] }): JSX.Element {
	useHead([...props.tags]);
	return undefined;
}
