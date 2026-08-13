import { createPage } from "flare/page"
import { SxTabs } from "../components/sx-custom/tabs"

export const route = createPage("_root_/styling-sx-custom-tabs").render(() => {
	return (
		<main data-testid="styling-sx-custom-tabs">
			<SxTabs tabs={["Overview", "Details", "Settings"]} />
		</main>
	)
})
