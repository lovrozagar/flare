import { createPage } from "@lovrozagar/flare/page";
import { createSignal } from "solid-js";

export const route = createPage("_root_/styles").render(() => {
	const [on, setOn] = createSignal(false);

	return (
		<main data-testid="styles">
			<div class="bg-blue-500 p-4" data-testid="tw-class-static">
				Static Tailwind class
			</div>
			<div class={[on() && "bg-red-500"]} data-testid="tw-class-conditional">
				Conditional class
			</div>
			<button data-testid="tw-toggle" type="button" onClick={() => setOn((v) => !v)}>
				Toggle
			</button>
		</main>
	);
});
