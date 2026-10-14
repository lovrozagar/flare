import { STYLES_EVENT, stylesReply, type DevStyle } from "../../shared/protocol/index.ts";

// The longest a dev document waits for its styles: past it the document renders without them and the dev server logs
// one warning. A dev document never hangs on the dev server (B104).
const WAIT_MS = 2000;

// Vite's hot channel as a server environment's module sees it: the ssr runner's, or workerd's in Workers dev.
export type StylesChannel = {
	send(event: string, payload: unknown): void;
	on(event: string, listener: (payload: unknown) => void): void;
};

// Asks the dev server for the CSS modules a matched chain imports, by its route ids, over the hot channel (B104).
export function stylesClient(
	hot: StylesChannel,
	warn: (message: string) => void,
): (routes: readonly string[]) => Promise<DevStyle[]> {
	const waiting = new Map<number, (styles: DevStyle[]) => void>();
	let next = 0;
	hot.on(STYLES_EVENT, (payload) => {
		const reply = stylesReply(payload);
		const settle = reply === undefined ? undefined : waiting.get(reply.request);
		if (reply === undefined || settle === undefined) return;
		waiting.delete(reply.request);
		settle(reply.styles);
	});
	return (routes) =>
		new Promise((resolve) => {
			const request = next;
			next += 1;
			const timer = setTimeout(() => {
				waiting.delete(request);
				warn(`no dev styles from the dev server within ${WAIT_MS} ms; this document renders without them`);
				resolve([]);
			}, WAIT_MS);
			waiting.set(request, (styles) => {
				clearTimeout(timer);
				resolve(styles);
			});
			hot.send(STYLES_EVENT, { request, routes: [...routes] });
		});
}
