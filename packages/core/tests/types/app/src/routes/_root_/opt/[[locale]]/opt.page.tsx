import { createPage } from "@lovrozagar/flare";

export const route = createPage("_root_/opt/[[locale]]").render((props) => <p>{props.params.locale ?? "en"}</p>);
