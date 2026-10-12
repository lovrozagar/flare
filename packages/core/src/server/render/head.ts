import { escapeAttr } from "./escape.ts";
import { headTags, mergeHead, type HeadTag, type HeadTagOptions } from "../../shared/head/index.ts";
import type { HeadConfig } from "../../shared/route-builder/types.ts";

// The route .head() result. The type lives beside the builder that returns it.
export type Head = HeadConfig;

export type HeadOptions = HeadTagOptions;

export { mergeHead };

const VOID = new Set(["meta", "link"]);

// Serializes the shared head descriptors into the shell head. Escaping lives here, because the client sets DOM
// properties and parses no HTML.
export function renderHead(head: Head, options: HeadOptions = {}): string {
	return headTags(head, options).map(serialize).join("");
}

function serialize(tag: HeadTag): string {
	const { children, ...attributes } = tag.props;
	const open = `<${tag.tag}${Object.entries(attributes).map(attribute).join("")}>`;
	if (VOID.has(tag.tag)) return open;
	return `${open}${text(tag.tag, children)}</${tag.tag}>`;
}

function attribute([name, value]: [string, string | true]): string {
	return value === true ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`;
}

// Script and style text is not escaped. A case-insensitive `</script` or `</style` is rewritten so it cannot
// close the tag (B83).
function text(tag: HeadTag["tag"], children: string | true | undefined): string {
	if (typeof children !== "string") return "";
	if (tag === "script" || tag === "style") return children.replaceAll(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);
	return escapeAttr(children);
}
