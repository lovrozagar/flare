import { createPage } from "flare/page"
import { Link } from "flare/link"
import { createSignal } from "solid-js"

export const route = createPage("_root_/disabled-toggle").render(() => {
	const [disabled, setDisabled] = createSignal(true)

	return (
		<div data-testid="disabled-toggle">
			<h1>Disabled Toggle Test</h1>

			<button data-testid="toggle-btn" onClick={() => setDisabled((v) => !v)}>
				{disabled() ? "Enable" : "Disable"}
			</button>

			<p data-testid="disabled-state">{disabled() ? "disabled" : "enabled"}</p>

			<Link to="/about" disabled={disabled()} data-testid="toggle-link">
				About Link
			</Link>
		</div>
	)
})
