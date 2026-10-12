import { expect, it } from "vitest";
import * as constants from "./constants.ts";

it("names", () => {
	expect({ ...constants }).toEqual({
		KIND_PARAM: "_flare",
		STALE_PARAM: "_flare_stale",
		FN_PREFIX: "/_flare/fn/",
		BUILD_HEADER: "flare-build",
		RENDER_HEADER: "flare-render",
		CACHE_HEADER: "flare-cache",
	});
});
