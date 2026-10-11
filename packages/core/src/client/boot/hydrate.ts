import { createComponent } from "solid-js";
import { hydrate } from "@solidjs/web";
import { RouterContext, useRouter } from "../../shared/router/context.ts";
import type { Router } from "../../shared/router/create-router.ts";

type Dom = {
	document: Document;
	_$HY?: { done?: boolean; events: unknown[]; completed: WeakSet<object>; r: Record<string, unknown> };
};

export type ClientMatch = {
	id: string;
	params: Record<string, string | string[]>;
	search: Record<string, string | string[]>;
	data: unknown;
	preloader: unknown;
	head: unknown;
	error: unknown;
};

export type ClientState = { matches: ClientMatch[] };

const dom = globalThis as unknown as Dom;

export function readState(): ClientState {
	const script = [...dom.document.querySelectorAll("script")].find((node) => node.textContent.includes("self.flare="));
	const text = (script as HTMLScriptElement).textContent;
	return JSON.parse(text.slice(text.indexOf("=") + 1)) as ClientState;
}

export function hydrateDocument(router: Router): void {
	// Solid treats `_$HY.done` as "already hydrated" and then calls render(), which drops server markup.
	const runtime: NonNullable<Dom["_$HY"]> = { done: false, events: [], completed: new WeakSet(), r: {} };
	dom._$HY = runtime;
	const root = dom.document.getElementById("app") as HTMLElement;
	hydrate(
		() =>
			createComponent(RouterContext, {
				value: router,
				get children() {
					(dom.document.documentElement as HTMLElement & { flareRouter?: Router }).flareRouter = useRouter();
					return null;
				},
			}),
		root,
	);
	runtime.done = true;
	dom.document.documentElement.setAttribute("data-flare-hydrated", "");
}
