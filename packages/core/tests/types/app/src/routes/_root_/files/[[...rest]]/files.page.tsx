import { createPage } from "@lovrozagar/flare";

export const route = createPage("_root_/files/[[...rest]]").render((props) => (
	<p>{(props.params.rest ?? []).length}</p>
));
