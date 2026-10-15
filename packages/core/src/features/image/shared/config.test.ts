import { expect, it } from "vitest"
import { parseOptions } from "../../../vite/plugin/options.ts"
import { imageQuality, imageWidths } from "./config.ts"

// The source module holds what `image: {}` parses to, so a component outside the plugin agrees with it.
it("defaults", () => {
	expect({ widths: imageWidths, quality: imageQuality }).toEqual(parseOptions({ image: {} }).image)
})
