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
	dom._$HY = { done: true, events: [], completed: new WeakSet(), r: {} };
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
	dom.document.documentElement.setAttribute("data-flare-hydrated", "");
}
