import { createPage } from "flare/page"
import { styles } from "flare/styles"

export const route = createPage("_root_/styling-combo")
	.head(() => ({
		css: "/combo-global.css",
		custom: { styles: [{ children: ".custom-inline { opacity: 0.9; }" }] },
	}))
	.render(() => {
		const boxProps = styles("combo-scoped", { css: "margin: 10px;" })
		const twProps = styles("combo-tw", { css: "color: rgb(239,68,68);" })
		const cssProps = styles("combo-css", { css: "font-style: italic;" })
		return (
			<main data-testid="styling-combo">
				<div class="combo-global" data-testid="combo-global">
					Global
				</div>
				<div class="custom-inline" data-testid="combo-inline">
					Inline
				</div>
				<div {...boxProps} data-testid="combo-scoped">
					Scoped
				</div>
				<div {...twProps} data-testid="combo-tw">
					TW
				</div>
				<div {...cssProps} data-testid="combo-css">
					CSS Prop
				</div>
			</main>
		)
	})
