import { createPage } from "@lovrozagar/flare/page";
import { lazy } from "@lovrozagar/flare/lazy";
import { createSignal } from "solid-js";

const LazySxBox = lazy({
	loader: () => import("../components/lazy-sx-box"),
	pending: () => <span data-testid="lazy-sx-pending">Loading...</span>,
});

export const route = createPage("_root_/styling-sx-lazy").render(() => {
	const [show, setShow] = createSignal(false);

	return (
		<main data-testid="styling-sx-lazy">
			<button data-testid="mount-lazy" onClick={() => setShow(true)} type="button">
				Mount Lazy
			</button>
			{show() && <LazySxBox />}
		</main>
	);
});
