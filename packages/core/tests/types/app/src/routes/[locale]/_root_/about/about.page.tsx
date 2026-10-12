import { createPage } from "@lovrozagar/flare";

export const route = createPage("[locale]/_root_/about").render((props) => <p>{props.params.locale}</p>);
