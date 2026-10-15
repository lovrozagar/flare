import { createPage } from "@lovrozagar/flare"

export const route = createPage("_root_/raw").response((ctx) => new Response(ctx.preloaderContext.requestId))
