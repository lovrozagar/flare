/**
 * The app's own service worker (Flare bundles src/service-worker.ts to /service-worker.js and
 * registers it). Precaches this build's files and serves /offline when a navigation fails.
 */
import { build, version } from "@lovrozagar/flare/service-worker";

interface ExtendableEvent extends Event {
	waitUntil(promise: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
	readonly request: Request;
	respondWith(response: Promise<Response> | Response): void;
}
declare const self: {
	addEventListener(type: "activate" | "install", listener: (event: ExtendableEvent) => void): void;
	addEventListener(type: "fetch", listener: (event: FetchEvent) => void): void;
	clients: { claim(): Promise<void> };
	skipWaiting(): Promise<void>;
};

const CACHE = `product-${version}`;
const OFFLINE = "/offline";
const precached = new Set(build);

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll([...build, OFFLINE]))
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((k) => k.startsWith("product-") && k !== CACHE).map((k) => caches.delete(k))),
			)
			.then(() => self.clients.claim()),
	);
});

self.addEventListener("fetch", (event) => {
	const url = new URL(event.request.url);
	if (event.request.mode === "navigate") {
		event.respondWith(fetch(event.request).catch(async () => (await caches.match(OFFLINE)) ?? Response.error()));
		return;
	}
	if (url.origin === location.origin && precached.has(url.pathname)) {
		event.respondWith(caches.match(url.pathname).then((hit) => hit ?? fetch(event.request)));
	}
});
