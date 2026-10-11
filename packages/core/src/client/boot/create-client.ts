import type { Router } from "../../shared/router/create-router.ts";
import { hydrateDocument, readState, type ClientMatch } from "./hydrate.ts";

export type Client = { match: ClientMatch };

type HistoryDom = { history: History & { state: { index?: number } | null } };

export function createClient(router: Router): Client {
	const state = readState();
	queueMicrotask(() => {
		hydrateDocument(router);
		adoptHistory();
	});
	return { match: state.matches[0] as ClientMatch };
}

function adoptHistory(): void {
	const history = (globalThis as unknown as HistoryDom).history;
	if (typeof history.state?.index === "number") return;
	history.replaceState({ index: 0 }, "");
}
