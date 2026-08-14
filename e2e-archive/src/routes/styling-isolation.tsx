import { createPage } from "flare/page"
import { styles } from "flare/styles"
import { createSignal } from "solid-js"

function SameNameA() {
	const props = styles("shared-name", {
		css: "color: rgb(255, 0, 0); padding: 8px;",
	})
	return (
		<div {...props} data-testid="same-name-a">
			Same Name A
		</div>
	)
}

function SameNameB() {
	const props = styles("shared-name", {
		css: "color: rgb(0, 0, 255); padding: 8px;",
	})
	return (
		<div {...props} data-testid="same-name-b">
			Same Name B
		</div>
	)
}

export const route = createPage("_root_/styling-isolation").render(() => {
	const sib1 = styles("sib-one", { css: "color: rgb(255, 0, 0); padding: 4px;" })
	const sib2 = styles("sib-two", { css: "color: rgb(0, 128, 0); padding: 8px;" })
	const sib3 = styles("sib-three", { css: "color: rgb(0, 0, 255); padding: 12px;" })
	const sib4 = styles("sib-four", { css: "color: rgb(255, 165, 0); padding: 16px;" })
	const sib5 = styles("sib-five", {
		css: (s) => `
			color: rgb(128, 0, 128);
			padding: 20px;
			${s.highlight("true")} { color: rgb(255, 255, 0); }
		`,
		state: { highlight: "false" },
	})

	const parentProps = styles("nest-parent", { css: "color: rgb(100, 0, 0); padding: 8px;" })
	const childProps = styles("nest-child", { css: "color: rgb(0, 100, 0); padding: 8px;" })
	const grandchildProps = styles("nest-grand", { css: "color: rgb(0, 0, 100); padding: 8px;" })

	const [highlight, setHighlight] = createSignal(false)

	return (
		<main data-testid="styling-isolation">
			<section data-testid="siblings">
				<div {...sib1} data-testid="sib-1">
					Sibling 1
				</div>
				<div {...sib2} data-testid="sib-2">
					Sibling 2
				</div>
				<div {...sib3} data-testid="sib-3">
					Sibling 3
				</div>
				<div {...sib4} data-testid="sib-4">
					Sibling 4
				</div>
				<div {...sib5} data-highlight={String(highlight())} data-testid="sib-5">
					Sibling 5
				</div>
			</section>

			<button
				data-testid="toggle-highlight"
				onClick={() => setHighlight((prev) => !prev)}
				type="button"
			>
				Toggle Highlight
			</button>

			<section data-testid="nested">
				<div {...parentProps} data-testid="nest-parent">
					Parent
					<div {...childProps} data-testid="nest-child">
						Child
						<div {...grandchildProps} data-testid="nest-grand">
							Grandchild
						</div>
					</div>
				</div>
			</section>

			<section data-testid="same-name">
				<SameNameA />
				<SameNameB />
			</section>
		</main>
	)
})
