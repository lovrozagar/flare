import { createPage } from "@lovrozagar/flare"

// Never rendered: its layout's loader fails first.
export const route = createPage("_root_/(area)/area-missing").render(() => <p>never</p>)
