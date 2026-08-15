/**
 * Vite under `deno run npm:vite` dies on HMR websocket teardown:
 *   Uncaught (in promise) ConnectionReset: Connection reset by peer
 * Deno treats that as fatal, so the rest of the Playwright suite gets
 * ECONNREFUSED. Swallow only that reset — real errors still surface.
 */
const RESET = /Connection reset|Broken pipe|ECONNRESET|EPIPE/i;

function isReset(reason: unknown): boolean {
	if (reason instanceof Error) return RESET.test(reason.message) || RESET.test(reason.name);
	return RESET.test(String(reason ?? ""));
}

globalThis.addEventListener("unhandledrejection", (e) => {
	if (isReset(e.reason)) e.preventDefault();
});
globalThis.addEventListener("error", (e) => {
	if (isReset((e as ErrorEvent).error ?? e.message)) e.preventDefault();
});

await import(new URL("../../node_modules/vite/bin/vite.js", import.meta.url).href);
