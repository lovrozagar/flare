import { createPage } from "@lovrozagar/flare/page";
import { styles } from "@lovrozagar/flare/styles";

export const route = createPage("_root_/styling-tw-static").render(() => {
	const flexBox = styles("tw-static-flex", {
		css: "border: 2px solid rgb(0, 0, 0);",
	});
	const colorBox = styles("tw-static-color", {});
	const stateBox = styles("tw-static-state", {
		css: (s) => `
			padding: 12px;
			${s.active("true")} { opacity: 0.5; }
		`,
		state: { active: "false" },
	});
	const varsBox = styles("tw-static-vars", {
		css: (_s, v) => `color: ${v.accent};`,
		vars: { accent: "rgb(128, 0, 255)" },
	});
	return (
		<main data-testid="styling-tw-static">
			<div {...flexBox} class="flex gap-4 p-8" data-testid="tw-static-flex">
				<span>A</span>
				<span>B</span>
			</div>
			<div {...colorBox} class="text-red-500 font-bold underline" data-testid="tw-static-color">
				TW Color
			</div>
			<div {...stateBox} class="bg-blue-500 text-white" data-testid="tw-static-state">
				TW + State
			</div>
			<div {...varsBox} class="font-bold" data-testid="tw-static-vars">
				TW + Vars
			</div>
		</main>
	);
});
