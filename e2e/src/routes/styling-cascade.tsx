import { createPage } from "flare/page"
import { styles } from "flare/styles"
import { createSignal } from "solid-js"

export const route = createPage("_root_/styling-cascade")
	.head(() => ({
		custom: { styles: [{ children: ".cascade-global { color: rgb(255, 0, 0); }" }] },
	}))
	.render(() => {
		/* global class + scoped styles() on same element */
		const scopedProps = styles("cascade-scoped", {
			css: "font-weight: bold; padding: 8px;",
		})

		/* scoped with !important to test cascade override */
		const importantProps = styles("cascade-important", {
			css: "color: rgb(0, 0, 255);",
		})

		/* styles() with state + css= native on wrapper */
		const stateProps = styles("cascade-state", {
			css: (s) => `
				color: rgb(128, 128, 128);
				${s.mode("dark")} { color: rgb(255, 255, 255); background: rgb(0, 0, 0); }
				${s.mode("light")} { color: rgb(0, 0, 0); background: rgb(255, 255, 255); }
			`,
			state: { mode: "light" },
		})

		const [mode, setMode] = createSignal<"light" | "dark">("light")

		/* deeply nested: outer sets color, middle sets background, inner inherits */
		const outerProps = styles("cascade-outer", {
			css: "color: rgb(200, 0, 0);",
		})
		const middleProps = styles("cascade-middle", {
			css: "background: rgb(240, 240, 240); padding: 8px;",
		})
		const innerProps = styles("cascade-inner", {
			css: "font-style: italic;",
		})

		return (
			<main data-testid="styling-cascade">
				<div class="cascade-global" {...scopedProps} data-testid="cascade-global-scoped">
					Global + Scoped
				</div>

				<div class="cascade-global" {...importantProps} data-testid="cascade-override">
					Global vs Scoped Override
				</div>

				<button
					data-testid="toggle-mode"
					onClick={() => setMode((m) => (m === "light" ? "dark" : "light"))}
					type="button"
				>
					Toggle Mode
				</button>
				<div {...stateProps} data-mode={mode()} data-testid="cascade-state">
					State Mode: {mode()}
				</div>

				<div {...outerProps} data-testid="cascade-outer">
					Outer
					<div {...middleProps} data-testid="cascade-middle">
						Middle
						<div {...innerProps} data-testid="cascade-inner">
							Inner (inherits outer color)
						</div>
					</div>
				</div>
			</main>
		)
	})
