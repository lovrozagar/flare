import { isCSSRequest, type Plugin } from "vite";

// A CSS module's file name: its import is an object of class names, code a server render reads.
const CSS_MODULE = /\.module\.\w+$/;

// A plain stylesheet edit reaches the page through the client's own CSS update and the dev styles, which read the file
// through the client environment (B104). A server environment renders nothing from it, so it takes the update as
// handled. Without that, Solid's plugin, which sends a server environment a full reload for any update that still has
// modules (as nothing on the server accepts one), reloaded every server module, and a render in flight mixed the old
// modules with the new ones: a page rendered with no hydration keys, a context its provider never set (BUGS.md 99).
// The hook runs first, so no other plugin sees the stylesheet's modules. A CSS module, or an import with a query
// (`?inline`, `?url`), is code the server reads, and keeps the other plugins' and Vite's own update.
export function cssUpdate(): Plugin {
	return {
		name: "flare:css-update",
		hotUpdate: {
			order: "pre",
			handler(options) {
				if (this.environment.config.consumer !== "server") return;
				if (!isCSSRequest(options.file) || CSS_MODULE.test(options.file)) return;
				if (options.modules.some((module) => module.url.includes("?"))) return;
				return [];
			},
		},
	};
}
