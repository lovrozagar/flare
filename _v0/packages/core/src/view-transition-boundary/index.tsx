import { children, createEffect } from "solid-js";
import type { JSX } from "@solidjs/web";
import { registerBoundary } from "./registry.ts";

const MISUSE = "<ViewTransitionBoundary> needs exactly one element child (it renders no wrapper of its own); got";

let reportedMisuse = false;

function describeNodes(nodes: unknown[]): string {
	return nodes
		.map((n) => (n instanceof Element ? `<${n.tagName.toLowerCase()}>` : typeof n === "string" ? "text" : String(n)))
		.join(", ");
}

/**
 * Scope view transitions of navigations inside it to its child element: content outside (sidebar,
 * header, tabs) keeps hover, clicks and CSS transitions while the child animates.
 *
 * ```tsx
 * <aside>…</aside>
 * <ViewTransitionBoundary>
 *   <main>{props.children}</main>
 * </ViewTransitionBoundary>
 * ```
 *
 * Renders its child unchanged. The child must resolve to exactly one element; a component child
 * works when it renders one root element, and an empty child (a false `<Show>`) is inactive.
 */
export function ViewTransitionBoundary(props: { children: JSX.Element }): JSX.Element {
	const resolved = children(() => props.children);

	createEffect(
		() => resolved.toArray().filter((n) => n !== null && n !== undefined && n !== false && n !== ""),
		(nodes) => {
			if (nodes.length === 0) return;
			const [node] = nodes;
			if (nodes.length > 1 || !(node instanceof Element)) {
				const message = `${MISUSE} ${describeNodes(nodes)}`;
				if (import.meta.env.DEV) throw new Error(message);
				if (!reportedMisuse) {
					reportedMisuse = true;
					console.error(message);
				}
				return;
			}
			return registerBoundary(node);
		},
	);

	return resolved as unknown as JSX.Element;
}
