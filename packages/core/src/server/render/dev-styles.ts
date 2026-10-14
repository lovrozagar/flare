import { STYLES_EVENT, stylesReply, type DevStyle } from "../../shared/protocol/index.ts";

// The longest a dev document waits for its styles: past it the document renders without them and the dev server logs
// one warning. A dev document never hangs on the dev server (B104).
const WAIT_MS = 2000;

// Vite's hot channel as a server environment's module sees it: the ssr runner's, or workerd's in Workers dev. `data`
// is the module's own, which Vite keeps across its re-evaluations.
export type StylesChannel = {
	send(event: string, payload: unknown): void;
	on(event: string, listener: (payload: unknown) => void): void;
	data?: object | undefined;
};

type Pending = { waiting: Map<number, (styles: DevStyle[]) => void>; next: number };

const PENDING = "flare:styles";

// Asks the dev server for the CSS modules a matched chain imports, by its route ids, over the hot channel (B104).
export function stylesClient(
	hot: StylesChannel,
	warn: (message: string) => void,
): (routes: readonly string[]) => Promise<DevStyle[]> {
	const pending = pendingOf(hot);
	hot.on(STYLES_EVENT, (payload) => {
		const reply = stylesReply(payload);
		const settle = reply === undefined ? undefined : pending.waiting.get(reply.request);
		if (reply === undefined || settle === undefined) return;
		pending.waiting.delete(reply.request);
		settle(reply.styles);
	});
	return (routes) =>
		new Promise((resolve) => {
			const request = pending.next;
			pending.next += 1;
			const timer = setTimeout(() => {
				pending.waiting.delete(request);
				warn(`no dev styles from the dev server within ${WAIT_MS} ms; this document renders without them`);
				resolve([]);
			}, WAIT_MS);
			pending.waiting.set(request, (styles) => {
				clearTimeout(timer);
				resolve(styles);
			});
			hot.send(STYLES_EVENT, { request, routes: [...routes] });
		});
}

// The requests in flight, in the module's hot `data`. A full reload re-evaluates the server modules, and the new hot
// context drops the previous evaluation's listeners, so a reply to a request sent before the reload reaches only the
// new listener: kept here, it is settled instead of waiting out the bound (BUGS.md 86).
function pendingOf(hot: StylesChannel): Pending {
	const data = hot.data ?? {};
	const kept: unknown = Reflect.get(data, PENDING);
	if (isPending(kept)) return kept;
	const fresh: Pending = { waiting: new Map(), next: 0 };
	Reflect.set(data, PENDING, fresh);
	return fresh;
}

function isPending(value: unknown): value is Pending {
	return Reflect.get(Object(value), "waiting") instanceof Map;
}
