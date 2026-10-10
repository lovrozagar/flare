import { createQueryClientGetter } from "@lovrozagar/flare/query-client";
import { createRouter } from "@lovrozagar/flare/router";
import { layouts, routeTree } from "./_gen/routes.gen";

export const router = createRouter({
	layouts,
	queryClientGetter: createQueryClientGetter(),
	routeTree,
});
