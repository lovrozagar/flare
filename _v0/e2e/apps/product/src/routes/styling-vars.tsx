import { createPage } from "@lovrozagar/flare/page";
import { styles } from "@lovrozagar/flare/styles";

export const route = createPage("_root_/styling-vars").render(() => {
	const props = styles("var-box", {
		css: (s, v) => `color: ${v.color}; ${s.active(true)} { font-weight: bold; }`,
		state: { active: true },
		vars: { color: "green" },
	});
	return (
		<main data-testid="styling-vars">
			<div {...props} data-testid="var-box">
				Vars Styled
			</div>
		</main>
	);
});
