import { expect, it } from "vitest"
import * as constants from "./constants.ts"

it("names", () => {
	expect({ ...constants }).toEqual({
		KIND_PARAM: "_flare",
		STALE_PARAM: "_flare_stale",
		FN_PREFIX: "/_flare/fn/",
		INPUT_PARAM: "_i",
		BUILD_PARAM: "_b",
		BUILD_HEADER: "flare-build",
		RENDER_HEADER: "flare-render",
		CACHE_HEADER: "flare-cache",
		COOKIES_HEADER: "flare-cookies",
		FN_HEADER: "flare-fn",
		STATUS_HEADER: "flare-status",
		REDIRECT_STATUSES: [301, 302, 303, 307, 308],
		FAILED_HEADER: "flare-failed",
		TAB_HEADER: "flare-dev-tab",
	})
})
