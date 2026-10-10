import { createPage } from "@lovrozagar/flare/page";
import { cn } from "@lovrozagar/flare/styles";
import { createSignal } from "solid-js";

export const route = createPage("_root_/").render(() => {
	const [on, setOn] = createSignal(false);
	return (
		<div>
			<button type="button" onClick={() => setOn((value) => !value)}>
				toggle
			</button>
			<div class={cn("p-2", on() && "p-8")} data-testid="cn-dynamic-pad" />
		</div>
	);
});
