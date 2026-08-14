import { createPathSegment } from "flare/path-segment"

export const pathSegment = createPathSegment("[[locale]]").cache({
	isr: {
		dynamicParams: false,
		params: () => [{ locale: "hr" }, { locale: "fr" }],
	},
})
