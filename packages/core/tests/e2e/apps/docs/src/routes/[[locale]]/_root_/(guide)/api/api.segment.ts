import { createPathSegment } from "@lovrozagar/flare";

// The `api` folder has no layout. Its segment sets the CDN default for every reference page under it.
export const route = createPathSegment("[[locale]]/_root_/(guide)/api").cache({
	cdn: { maxAge: "1m", swr: "10m", tags: ["api-reference"] },
});
