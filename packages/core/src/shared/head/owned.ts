import type { HeadTag } from "./tags.ts"

// Flare's own head tags (BUGS.md 460): every link, script, and style of the merge. Solid's useHead keys and replaces
// only title and meta; a link, script, or style it adds is never adopted or removed, so a served inline script ran
// again at hydration and a page's custom tags outlived it. The server writes each owned tag with its key in
// `data-fh`, and the client's applyOwned adopts, inserts, and removes them by that key. Title and meta stay Solid's.
export const OWNED_KEY = "data-fh"

export function isOwned(tag: HeadTag): boolean {
	return tag.tag !== "title" && tag.tag !== "meta"
}

// The owned tags as the server writes them into `<head>`. Attribute values are escaped; a script's or style's text is
// headTags' own, which already keeps it from closing its element. `false` is an attribute not written.
export function ownedHtml(tags: readonly HeadTag[]): string {
	return tags.map(ownedElement).join("")
}

function ownedElement(tag: HeadTag): string {
	const attributes = Object.entries(tag.props)
		.map(([name, value]) => {
			if (name === "children" || value === false) return ""
			return value === true ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`
		})
		.join("")
	const open = `<${tag.tag}${attributes} ${OWNED_KEY}="${escapeAttribute(tag.key)}">`
	if (tag.tag === "link") return open
	return `${open}${String(tag.props["children"] ?? "")}</${tag.tag}>`
}

function escapeAttribute(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
}
