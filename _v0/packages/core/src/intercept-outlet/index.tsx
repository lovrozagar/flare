import { Show, useContext } from "solid-js";
import type { JSX } from "@solidjs/web";
import { RouterContext } from "../outlet/index.tsx";
import type { InterceptedState } from "../outlet/types.ts";

export type { InterceptedState } from "../outlet/types.ts";

export interface InterceptOutletProps {
	children: (state: InterceptedState) => JSX.Element;
}

/**
 * Renders intercepted route content. SSR-safe — returns null when outside
 * FlareProvider (root layout renders in NoHydration during SSR).
 *
 * Unkeyed on purpose: the function child receives an accessor. Reading it in
 * JSX re-invokes `children` when intercept identity changes (overlay A → B).
 */
export function InterceptOutlet(props: InterceptOutletProps): JSX.Element {
	const ctx = useContext(RouterContext);
	return (<Show when={ctx?.intercepted()}>{(state) => <>{props.children(state())}</>}</Show>) as JSX.Element;
}
