import { createPathSegment } from "@lovrozagar/flare"

export const route = createPathSegment("_root_/seg").cache({ cdn: { maxAge: "1m" } })
