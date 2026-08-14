import { createPage } from "flare/page"

export const route = createPage("_root_/optional-locale/[[locale]]")
	.cache({ cdn: { maxAge: "1d", swr: "7d", tags: ["fs-paths"] }, isr: true })
	.render((props) => (
		<main data-testid="opt-locale">{String(props.location.params.locale ?? "none")}</main>
	))
