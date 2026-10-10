import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/files/[...path]")
	.cache({ cdn: { maxAge: "1d", swr: "7d", tags: ["fs-paths"] }, isr: true })
	.render((props) => <main data-testid="files">{String(props.location.params.path)}</main>);
