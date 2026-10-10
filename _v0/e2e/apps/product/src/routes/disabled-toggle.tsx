import { Link } from "@lovrozagar/flare/link";
import { createPage } from "@lovrozagar/flare/page";
import { createSignal } from "solid-js";

export const route = createPage("_root_/disabled-toggle").render(() => {
	const [disabled, setDisabled] = createSignal(true);
	return (
		<main data-testid="disabled-toggle">
			<button data-testid="toggle-btn" type="button" onClick={() => setDisabled((v) => !v)}>
				{disabled() ? "Enable" : "Disable"}
			</button>
			<p data-testid="disabled-state">{disabled() ? "disabled" : "enabled"}</p>
			<Link data-testid="toggle-link" disabled={disabled()} to="/about">
				About Link
			</Link>
		</main>
	);
});
