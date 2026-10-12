import type { Router } from "../../shared/router/create-router.ts";
import { createHistory } from "../history/index.ts";
import { hydrateDocument, readState, type ClientMatch } from "./hydrate.ts";

export type Client = { match: ClientMatch };

export function createClient(router: Router): Client {
	const state = readState();
	queueMicrotask(() => {
		hydrateDocument(router);
		createHistory(history).adopt();
	});
	return { match: state.matches[0] as ClientMatch };
}
