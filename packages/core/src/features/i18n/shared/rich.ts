import { createComponent } from "solid-js";
import type { JSX } from "@solidjs/web";
import { formatMessage, type Values } from "./format.ts";

export type RichComponent = (props: { children?: JSX.Element }) => JSX.Element;
export type RichComponents = Readonly<Record<string, RichComponent>>;

type Token = { text: string; name?: string; close?: boolean };

// `{tag}`, `{/tag}`, and the text between them.
const TAG = /\{(\/?)([A-Za-z_$][\w$-]*)\}/g;

// A message with component tags (dx/features.md i18n `t.rich`). ICU runs first, so a placeholder wins over a
// component of the same name. Then `{tag}...{/tag}`, or a lone `{tag}`, calls the component when `tag` is its own key.
// Every other piece is text, which the renderer escapes.
export function richText(
	message: string,
	components: RichComponents,
	icu?: { values: Values; tag: string },
): JSX.Element {
	const text = icu === undefined ? message : formatMessage(message, icu.values, icu.tag);
	return build(tokens(text, components), components);
}

function tokens(text: string, components: RichComponents): Token[] {
	const out: Token[] = [];
	let last = 0;
	for (const match of text.matchAll(TAG)) {
		const name = String(match[2]);
		if (!Object.hasOwn(components, name)) continue;
		out.push({ text: text.slice(last, match.index) });
		out.push({ text: match[0], name, close: match[1] === "/" });
		last = match.index + match[0].length;
	}
	out.push({ text: text.slice(last) });
	return out.filter((token) => token.text !== "");
}

// Nodes from tokens. An opening tag takes everything up to its matching close as children. One with no close is a
// lone tag. A close with no opening tag is text.
function build(list: readonly Token[], components: RichComponents): JSX.Element[] {
	const nodes: JSX.Element[] = [];
	// A paired tag's children are built from the tokens up to its close, which the loop then passes over.
	let skip = -1;
	for (const [index, token] of list.entries()) {
		if (index <= skip) continue;
		const component = token.name === undefined || token.close === true ? undefined : components[token.name];
		if (component === undefined) {
			const last = nodes.length - 1;
			const previous = nodes[last];
			if (typeof previous === "string") nodes[last] = previous + token.text;
			else nodes.push(token.text);
			continue;
		}
		const end = matchingClose(list, index);
		const inner = end === -1 ? [] : build(list.slice(index + 1, end), components);
		nodes.push(createComponent(component, end === -1 ? {} : { children: inner }));
		skip = end;
	}
	return nodes;
}

function matchingClose(list: readonly Token[], open: number): number {
	const name = list[open]?.name;
	let depth = 0;
	for (let index = open; index < list.length; index += 1) {
		const token = list[index];
		if (token?.name !== name) continue;
		depth += token?.close === true ? -1 : 1;
		if (depth === 0) return index;
	}
	return -1;
}
