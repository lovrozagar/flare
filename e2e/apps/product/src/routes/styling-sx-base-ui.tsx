import type { Component } from "solid-js";
import { createPage } from "@lovrozagar/flare/page";
import { clientLazy } from "@lovrozagar/flare/lazy";

/* base-ui-solid calls client-only Solid primitives at module eval time —
 * must be deferred to client via clientLazy to avoid SSR crashes */
type AnyComp = Component<Record<string, unknown>>;

const DialogDemo = clientLazy({
	loader: (): Promise<{ default: AnyComp }> =>
		import("../components/base-ui-dialog-demo").then((m) => ({ default: m.DialogDemo as AnyComp })),
});

const PolyDemo = clientLazy({
	loader: (): Promise<{ default: AnyComp }> =>
		import("../components/base-ui-dialog-demo").then((m) => ({ default: m.PolyDemo as AnyComp })),
});

export const route = createPage("_root_/styling-sx-base-ui").render(() => (
	<main data-testid="styling-sx-base-ui">
		<section>
			<h3>Dialog: sx + class on Base UI primitives</h3>
			<DialogDemo />
		</section>
		<section>
			<h3>render prop: polymorphic anchor trigger</h3>
			<PolyDemo />
		</section>
	</main>
));
