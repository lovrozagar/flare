import { createClient } from "@lovrozagar/flare/client";
import { getQueryClient } from "./query-client";
import { router } from "./router";

const w = window as unknown as Record<string, unknown>;
let interacted = false;
let idled = false;

createClient(() => router)
	.onInteraction(() => {
		interacted = true;
	})
	.onIdle(() => {
		idled = true;
	})
	.onReady((ctx) => {
		w.__flareNavigate = (to: string, opts?: Record<string, unknown>) => ctx.navigate({ to, ...opts });
		w.__flareNavigationPhase = () => ctx.navigationPhase();
		w.__flareViewTransition = () => ctx.viewTransition?.() ?? null;
		w.__flareInvalidate = (opts?: Record<string, unknown>) => ctx.invalidate(opts);
		w.__flareQueryClient = getQueryClient();
		w.__flareInteracted = () => interacted;
		w.__flareIdled = () => idled;
	});
