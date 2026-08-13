import { createPage } from "flare/page"
import { styles } from "flare/styles"

export const route = createPage("_root_/styling-nav-stress").render(() => {
	const s1 = styles("stress-header", { css: "color: rgb(255, 0, 0); padding: 16px;" })
	const s2 = styles("stress-body", { css: "color: rgb(0, 128, 0); padding: 12px;" })
	const s3 = styles("stress-footer", { css: "color: rgb(0, 0, 255); padding: 8px;" })
	const s4 = styles("stress-sidebar", { css: "color: rgb(255, 165, 0); padding: 10px;" })
	const s5 = styles("stress-badge", {
		css: (sel) => `
			padding: 4px 8px;
			color: rgb(128, 128, 128);
			${sel.active("true")} { color: rgb(0, 200, 0); }
		`,
		state: { active: "true" },
	})

	return (
		<main data-testid="styling-nav-stress">
			<div {...s1} data-testid="stress-header">
				Header
			</div>
			<div {...s2} data-testid="stress-body">
				Body
			</div>
			<div {...s3} data-testid="stress-footer">
				Footer
			</div>
			<div {...s4} data-testid="stress-sidebar">
				Sidebar
			</div>
			<div {...s5} data-testid="stress-badge">
				Badge
			</div>
		</main>
	)
})
