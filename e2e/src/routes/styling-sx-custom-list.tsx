import { createPage } from "flare/page"
import { SxList } from "../components/sx-custom/list"

export const route = createPage("_root_/styling-sx-custom-list").render(() => {
	return (
		<main data-testid="styling-sx-custom-list">
			<SxList items={["Alpha", "Beta", "Gamma", "Delta"]} />
		</main>
	)
})
