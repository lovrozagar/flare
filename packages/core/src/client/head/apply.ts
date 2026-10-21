import { createEffect, createMemo } from "solid-js"
import { useHead } from "@solidjs/web"
import { nonce } from "../../shared/csp/nonce.ts"
import { headTags, isOwned, isReplacing, mergeHead, type HeadTag } from "../../shared/head/index.ts"
import type { HeadConfig } from "../../shared/route-builder/types.ts"
import { applyOwned } from "./owned.ts"

// The chain's merged head, from the `h` frames in the slot order the server used (B83). A match with no head is
// skipped. Title and meta go through one useHead, which removes a tag the new merge does not contain; links,
// scripts, and styles are Flare's own, applied once the commit is on screen, so a cancelled navigation changes
// nothing (BUGS.md 460).
export function applyHeads(heads: () => readonly (HeadConfig | undefined)[]): void {
	const tags = createMemo(() => {
		const merged = heads().reduce<HeadConfig>(
			(into, head) => (head === undefined ? into : mergeHead(into, head, isReplacing(head))),
			{},
		)
		return headTags(merged, { nonce: nonce() }).filter((tag) => !shellOnly(tag))
	})
	useHead(() => {
		const replaceable = tags().filter((tag) => !isOwned(tag))
		// No title in the merge is no title, as a hard load writes none: an empty one replaces the previous page's
		// (BUGS.md 428).
		const title = replaceable.some((tag) => tag.tag === "title")
		return title ? replaceable : [{ tag: "title", key: "title", props: { children: "" } }, ...replaceable]
	})
	createEffect(
		() => tags().filter(isOwned),
		(owned) => applyOwned(owned),
	)
}

// `<meta charset>` belongs to the document the server wrote. The client cannot change it, and useHead warns
// when handed one (BUGS.md B5).
function shellOnly(tag: HeadTag): boolean {
	return tag.tag === "meta" && "charset" in tag.props
}
