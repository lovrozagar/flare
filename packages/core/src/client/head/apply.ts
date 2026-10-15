import { useHead } from "@solidjs/web"
import { nonce } from "../../shared/csp/nonce.ts"
import { headTags, mergeHead, type HeadTag } from "../../shared/head/index.ts"
import type { HeadConfig } from "../../shared/route-builder/types.ts"

// One useHead for the whole chain, fed the `h` frames in the slot order the server used (B83). A match with no
// head is skipped. A tag the new merge does not contain is removed by Solid.
export function applyHeads(heads: () => readonly (HeadConfig | undefined)[]): void {
	useHead(() => {
		const merged = heads().reduce<HeadConfig>((into, head) => (head === undefined ? into : mergeHead(into, head)), {})
		return headTags(merged, { nonce: nonce() }).filter((tag) => !shellOnly(tag))
	})
}

// `<meta charset>` belongs to the document the server wrote. The client cannot change it, and useHead warns
// when handed one (BUGS.md B5).
function shellOnly(tag: HeadTag): boolean {
	return tag.tag === "meta" && "charset" in tag.props
}
