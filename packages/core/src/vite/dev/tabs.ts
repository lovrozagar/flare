import { TAB_HEADER } from "../../shared/protocol/index.ts";

// Dev tab routing (dx/plugin.md, BUGS.md B38, B42). The dev server mints a token for each document it serves, the tab
// announces it on the client hot channel, and a payload tagged with it reaches that tab only. Nothing is broadcast.
// The overlay uses it, and so will the dev log bridge and any other dev server seam, so it knows no server's internals.

// The client hot channel event a tab announces its token with.
export const TAB_EVENT = "flare:tab";

// One connected tab, as Vite's hot channel hands it to a listener.
export type TabClient = { send(payload: unknown): void };

export type Tabs = {
	announce: (token: string, client: TabClient) => void;
	deliver: (token: string | undefined, payload: unknown) => void;
	drop: (client: TabClient) => void;
};

// A payload for a tab that has not announced yet, such as a document's own error, waits this long, and at most this
// many wait across tabs: the 21st drops the oldest.
const HOLD_MS = 30_000;
const HOLD_MAX = 20;

type Held = { token: string; payload: unknown; at: number };

export function createTabs(): Tabs {
	const open = new Map<string, TabClient>();
	let held: Held[] = [];
	const unexpired = (): void => {
		const now = Date.now();
		held = held.filter((entry) => now - entry.at <= HOLD_MS);
	};
	return {
		announce(token, client) {
			open.set(token, client);
			unexpired();
			for (const entry of held) if (entry.token === token) client.send(entry.payload);
			held = held.filter((entry) => entry.token !== token);
		},
		// A payload with no token came from a request no tab made, such as curl: no tab gets it.
		deliver(token, payload) {
			if (token === undefined) return;
			const client = open.get(token);
			if (client !== undefined) return client.send(payload);
			unexpired();
			held.push({ token, payload, at: Date.now() });
			if (held.length > HOLD_MAX) held.shift();
		},
		drop(client) {
			for (const [token, connected] of open) if (connected === client) open.delete(token);
		},
	};
}

// A fresh token for a document the dev server serves.
export function tabToken(): string {
	return crypto.randomUUID();
}

// The tag the dev server writes into that document's head, after the app answered, so no store ever keeps it.
export function tabMeta(token: string): string {
	return `<meta name="${TAB_HEADER}" content="${token}">`;
}

// What the SSR graph sends: `{ token, payload }`. Anything else is a payload no tab gets.
export function tabbedPayload(message: unknown): { token: string | undefined; payload: unknown } {
	const token: unknown = Reflect.get(Object(message), "token");
	return { token: typeof token === "string" ? token : undefined, payload: Reflect.get(Object(message), "payload") };
}
