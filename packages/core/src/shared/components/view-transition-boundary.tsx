/// <reference types="vite/client" />
import { children, createComponent, createContext, createEffect, type Context } from "solid-js";
import type { JSX } from "@solidjs/web";

// The innermost boundary's element, read by the outlets inside it. Outside any boundary there is none, so
// `scope: "auto"` falls back to the document (dx/navigate.md).
export const TransitionScopeContext: Context<() => Element | undefined> = createContext<() => Element | undefined>(
	() => undefined,
);

// The boundary adds no wrapper: its scope is the app's own element. Registration runs in an effect, which does
// not run in a server render, so SSR returns the child unchanged.
export function ViewTransitionBoundary(props: { children: JSX.Element }): JSX.Element {
	const held: { element?: Element } = {};
	return createComponent(TransitionScopeContext, {
		value: () => held.element,
		get children() {
			const resolved = children(() => props.children);
			createEffect(
				() => resolved.toArray(),
				(nodes) => {
					const element = boundaryElement(nodes);
					if (element === undefined) return;
					held.element = element;
					// Solid 2 runs the cleanup an effect returns before the next run and on dispose.
					return () => {
						delete held.element;
					};
				},
			);
			return resolved();
		},
	});
}

// An empty child registers nothing. More than one node, or a node that is not an element, throws in dev and
// registers nothing in production.
function boundaryElement(nodes: readonly unknown[]): Element | undefined {
	const present = nodes.filter((node) => node !== false && node !== null && node !== undefined && node !== "");
	if (present.length === 0) return undefined;
	const [only] = present;
	if (present.length === 1 && only instanceof Element) return only;
	if (import.meta.env.DEV) throw new Error("ViewTransitionBoundary takes one element child");
	return undefined;
}
