import { createPage } from "@lovrozagar/flare/page";
import { cn } from "@lovrozagar/flare/styles";
import { createSignal } from "solid-js";

export const route = createPage("_root_/styling-cn-dynamic").render(() => {
	const [big, setBig] = createSignal(false);
	return (
		<main data-testid="styling-cn-dynamic">
			<button type="button" data-testid="cn-dynamic-toggle" onClick={() => setBig((value) => !value)}>
				toggle
			</button>
			<div class={cn("p-2", big() && "p-8")} data-testid="cn-dynamic-pad" />
		</main>
	);
});
