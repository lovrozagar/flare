import { expect, it } from "vitest";
import { createRouter } from "../../shared/router/create-router.ts";
import type { Router } from "../../shared/router/create-router.ts";
import { createClient } from "./create-client.ts";

const match = {
	id: "_root_",
	params: {},
	search: {},
	data: { n: 1 },
	preloader: null,
	head: null,
	error: null,
};

function install(): Router {
	document.body.innerHTML = `<script>self.flare=${JSON.stringify({ matches: [match] })}</script><div id="app"></div>`;
	return createRouter({ layouts: {}, routeTree: [] });
}

it("adopts history", async () => {
	const router = install();
	history.replaceState({ index: 4 }, "");
	const length = history.length;
	createClient(router);
	await Promise.resolve();
	expect(history.length).toBe(length);
	expect(history.state).toEqual({ index: 4 });
});

it("router context", async () => {
	const router = install();
	history.replaceState(null, "");
	createClient(router);
	await Promise.resolve();
	expect((document.documentElement as HTMLElement & { flareRouter?: Router }).flareRouter).toBe(router);
	expect(history.state).toEqual({ index: 0 });
});
