/**
 * `modules: "all"`: after load and idle, prefetch every route's code into the HTTP cache so any
 * navigation finds its modules ready. `rel=prefetch` downloads at lowest priority without
 * executing. Scripts carry `crossorigin` so the cached copy matches the module fetch that uses
 * it (otherwise the browser downloads twice). Skipped on Data Saver and 2G. Client-safe.
 */
import { scheduleAfterLoad } from "./after-load.ts";
import { constrainedConnection } from "./connection.ts";

function alreadyLinked(href: string): boolean {
	for (const link of document.head.querySelectorAll('link[rel="prefetch"]')) {
		if (link.getAttribute("href") === href) return true;
	}
	return false;
}

function addPrefetch(href: string, as: "script" | "style"): void {
	if (alreadyLinked(href)) return;
	const link = document.createElement("link");
	link.setAttribute("rel", "prefetch");
	link.setAttribute("as", as);
	if (as === "script") link.setAttribute("crossorigin", "");
	link.setAttribute("href", href);
	document.head.appendChild(link);
}

export function startPrefetchAll(listUrl: string): void {
	if (typeof document === "undefined" || constrainedConnection()) return;
	scheduleAfterLoad(() => {
		void fetch(listUrl)
			.then((res) => (res.ok ? (res.json() as Promise<{ css?: string[]; js?: string[] }>) : undefined))
			.then((list) => {
				for (const href of list?.js ?? []) addPrefetch(href, "script");
				for (const href of list?.css ?? []) addPrefetch(href, "style");
			})
			.catch(() => {
				/* Speculative: the next navigation still loads what it needs */
			});
	});
}
