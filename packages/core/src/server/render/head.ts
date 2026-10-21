import { useHead, type JSX } from "@solidjs/web"
import { isOwned, type HeadTag } from "../../shared/head/index.ts"
import type { HeadConfig } from "../../shared/route-builder/types.ts"

// The route .head() result. The type lives beside the builder that returns it.
export type Head = HeadConfig

// Passes the merged .head() title and meta to Solid's useHead inside the render (B1, B83). Solid escapes the values
// and stamps each tag's `data-dh` identity, so the client's useHead adopts these elements instead of writing second
// copies. Links, scripts, and styles are Flare's own, which renderDocument writes with their `data-fh` keys
// (BUGS.md 460). renderDocument builds `tags` before the render, so a bad head fails before the shell.
export function DocumentHead(props: { tags: readonly HeadTag[] }): JSX.Element {
	useHead(props.tags.filter((tag) => !isOwned(tag)))
	return undefined
}
