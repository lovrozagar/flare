import { createPage } from "@lovrozagar/flare/page";
import { styles } from "@lovrozagar/flare/styles";

export const route = createPage("_root_/styling-full-css").render(() => {
	const mediaProps = styles("media-box", {
		css: `
			padding: 8px;
			color: rgb(0, 0, 255);
			@media (min-width: 1px) {
				background: rgb(200, 200, 255);
			}
		`,
	});
	const pseudoProps = styles("pseudo-box", {
		css: `
			color: rgb(100, 100, 100);
			&:hover { color: rgb(255, 0, 0); }
			&::before { content: ">>"; }
		`,
	});
	const keyframeProps = styles("keyframe-box", {
		css: `
			animation-name: spin-test;
			animation-duration: 2s;
			@keyframes spin-test {
				from { transform: rotate(0deg); }
				to { transform: rotate(360deg); }
			}
		`,
	});
	const nestedProps = styles("nested-box", {
		css: `
			padding: 4px;
			.inner { color: rgb(128, 0, 128); font-weight: bold; }
		`,
	});
	const stateProps = styles("state-box", {
		css: (s) => `
			color: rgb(0, 0, 0);
			${s.variant("primary")} { color: rgb(0, 100, 200); }
			${s.variant("danger")} { color: rgb(200, 0, 0); }
			${s.size("lg")} { font-size: 24px; }
		`,
		state: { size: "lg", variant: "primary" },
	});
	const varsProps = styles("vars-combo-box", {
		css: (_s, v) => `color: ${v.fg}; background: ${v.bg};`,
		style: { "font-weight": "900" },
		vars: { bg: "rgb(240, 240, 240)", fg: "rgb(0, 100, 0)" },
	});
	return (
		<main data-testid="styling-full-css">
			<div {...mediaProps} data-testid="media-box">
				Media Query
			</div>
			<div {...pseudoProps} data-testid="pseudo-box">
				Pseudo
			</div>
			<div {...keyframeProps} data-testid="keyframe-box">
				Keyframe
			</div>
			<div {...nestedProps} data-testid="nested-box">
				<span class="inner" data-testid="nested-inner">
					Nested
				</span>
			</div>
			<div {...stateProps} data-testid="state-box">
				State
			</div>
			<div {...varsProps} data-testid="vars-combo-box">
				Vars + Style
			</div>
		</main>
	);
});
