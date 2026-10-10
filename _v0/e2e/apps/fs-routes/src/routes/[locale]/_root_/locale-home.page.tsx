import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("[locale]/_root_/")
	.cache({ cdn: { maxAge: "1d", swr: "7d", tags: ["fs-paths"] }, isr: true })
	.render((props) => <main data-testid="locale-home">{String(props.location.params.locale)}</main>);
