import { createPage } from "@lovrozagar/flare/page";
import { createSignal } from "solid-js";

export const route = createPage("_root_/styling-sx-class-tailwind").render(() => {
	const [on, setOn] = createSignal(false);

	return (
		<main data-testid="styling-sx-class-tailwind">
			<div data-testid="tw-class-static" class="bg-blue-500 p-4">
				Static Tailwind class
			</div>

			<div data-testid="tw-class-conditional" class={[on() && "bg-red-500"]}>
				Conditional class
			</div>

			<button data-testid="tw-toggle" type="button" onClick={() => setOn((v) => !v)}>
				Toggle
			</button>
		</main>
	);
});
