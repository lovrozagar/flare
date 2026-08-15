import { createPage } from "@lovrozagar/flare/page";
import { styles } from "@lovrozagar/flare/styles";

export const route = createPage("_root_/styling-responsive").render(() => {
	const responsiveProps = styles("responsive-box", {
		css: `
			padding: 16px;
			background: rgb(255, 0, 0);
			@media (min-width: 800px) { background: rgb(0, 0, 255); }
		`,
	});

	const multiProps = styles("multi-breakpoint", {
		css: `
			font-size: 14px;
			@media (min-width: 600px) { font-size: 18px; }
			@media (min-width: 1000px) { font-size: 24px; }
		`,
	});

	return (
		<main data-testid="styling-responsive">
			<div {...responsiveProps} data-testid="responsive-box">
				Responsive Box
			</div>
			<div {...multiProps} data-testid="multi-breakpoint">
				Multi Breakpoint
			</div>
		</main>
	);
});
