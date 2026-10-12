import { children, createEffect } from "solid-js";
import type { JSX } from "@solidjs/web";

// The mark sits on the app's own element, so the boundary adds no wrapper and keeps no registry.
const BOUNDARY = Symbol("flare.viewTransitionBoundary");

type Marked = Element & { [BOUNDARY]?: true };

// Registration runs in an effect, which does not run in a server render, so SSR returns the child unchanged.
export function ViewTransitionBoundary(props: { children: JSX.Element }): JSX.Element {
	const resolved = children(() => props.children);
	createEffect(
		() => resolved.toArray(),
		(nodes) => {
			const element = boundaryElement(nodes);
			if (element === undefined) return;
			element[BOUNDARY] = true;
			// Solid 2 runs the cleanup an effect returns before the next run and on dispose.
			return () => {
				delete element[BOUNDARY];
			};
		},
	);
	return resolved();
}

// The innermost boundary around the swapped outlet, otherwise the document (dx/navigate.md scope "auto").
export function transitionScope(outlet: Node): Element | Document {
	for (let node = outlet.parentElement; node !== null; node = node.parentElement) {
		if (BOUNDARY in node) return node;
	}
	return document;
}

// An empty child registers nothing. More than one node, or a node that is not an element, throws in dev and
// registers nothing in production.
function boundaryElement(nodes: readonly unknown[]): Marked | undefined {
	const present = nodes.filter((node) => node !== false && node !== null && node !== undefined && node !== "");
	if (present.length === 0) return undefined;
	const [only] = present;
	if (present.length === 1 && only instanceof Element) return only;
	if (import.meta.env.DEV) throw new Error("ViewTransitionBoundary takes one element child");
	return undefined;
}
