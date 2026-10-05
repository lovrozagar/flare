/** Register the app's service worker once the page has loaded and is idle. Client-safe. */
import { scheduleAfterLoad } from "../prefetch/after-load.ts";

export function registerServiceWorker(url: string): void {
	if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
	scheduleAfterLoad(() => {
		/* updateViaCache "none": every update check fetches the worker script fresh. */
		navigator.serviceWorker.register(url, { scope: "/", updateViaCache: "none" }).catch(() => {});
	});
}
