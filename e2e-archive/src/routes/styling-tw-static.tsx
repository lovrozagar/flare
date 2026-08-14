import { createPage } from "flare/page"
import { styles } from "flare/styles"

export const route = createPage("_root_/styling-tw-static").render(() => {
	const flexBox = styles("tw-static-flex", {
		css: "border: 2px solid rgb(0, 0, 0);",
		tw: "flex gap-4 p-8",
	})
	const colorBox = styles("tw-static-color", {
		tw: "text-red-500 font-bold underline",
	})
	const stateBox = styles("tw-static-state", {
		css: (s) => `
			padding: 12px;
			${s.active("true")} { opacity: 0.5; }
		`,
		state: { active: "false" },
		tw: "bg-blue-500 text-white",
	})
	const varsBox = styles("tw-static-vars", {
		css: (_s, v) => `color: ${v.accent};`,
		tw: "font-bold",
		vars: { accent: "rgb(128, 0, 255)" },
	})
	return (
		<main data-testid="styling-tw-static">
			<div {...flexBox} data-testid="tw-static-flex">
				<span>A</span>
				<span>B</span>
			</div>
			<div {...colorBox} data-testid="tw-static-color">
				TW Color
			</div>
			<div {...stateBox} data-testid="tw-static-state">
				TW + State
			</div>
			<div {...varsBox} data-testid="tw-static-vars">
				TW + Vars
			</div>
		</main>
	)
})
