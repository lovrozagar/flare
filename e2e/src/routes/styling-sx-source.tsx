import { createPage } from "flare/page"
import { SourceButton } from "@flare/ui-test-source/button"
import { SourceCard } from "@flare/ui-test-source/card"

/*
 * Mode 3 cross-package test — lib ships source only, consumer's sx pipeline
 * processes both lib + consumer sx in a single unified pass. All atomic classes
 * land in the consumer's flare-global.css — no separate lib CSS file.
 */
export const route = createPage("_root_/styling-sx-source").render(() => {
	return (
		<main data-testid="styling-sx-source">
			<SourceCard data-testid="source-card">
				<SourceButton data-testid="source-btn">Source button</SourceButton>
				<SourceButton class="consumer-extra-src" data-testid="source-btn-extra">
					With consumer class
				</SourceButton>
			</SourceCard>

			{/* Consumer-authored sx in same build pass — no class duplication expected */}
			<div
				data-testid="source-consumer-box"
				sx={{ color: "rgb(20, 80, 160)", fontSize: "15px", fontWeight: "500" }}
			>
				Consumer sx alongside source lib
			</div>
		</main>
	)
})
