import { createPage } from "flare/page"

export const route = createPage("_root_/users/[id]")
	.cache({ cdn: { maxAge: "1d", swr: "7d", tags: ["fs-paths"] }, isr: true })
	.render((props) => <main data-testid="user">{String(props.location.params.id)}</main>)
