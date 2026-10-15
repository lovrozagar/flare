import { createPage } from "@lovrozagar/flare"

export const route = createPage("_root_/docs/[...path]").render((props) => <p>{props.params.path.join("/")}</p>)
