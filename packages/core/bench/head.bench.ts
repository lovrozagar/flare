import { bench, describe } from "vitest"
import { renderHeadToHtml } from "../src/ssr/head"
import type { HeadConfig } from "../src/route-builder/types"

describe("renderHeadToHtml", () => {
	const nonce = "a1b2c3d4e5f6a7b8"

	const simpleHead: HeadConfig = {
		title: "My Page",
	}

	const fullHead: HeadConfig = {
		custom: {
			links: [
				{ href: "/feed.xml", rel: "alternate", type: "application/rss+xml" },
				{ href: "/manifest.json", rel: "manifest" },
			],
			meta: [
				{ content: "article", property: "og:type" },
				{ content: "My Article", property: "og:title" },
				{ content: "A great article", property: "og:description" },
				{ content: "https://example.com/img.jpg", property: "og:image" },
			],
		},
		description: "A page about things",
		title: "Full Page Title — My Site",
	}

	bench("simple head — title only", () => {
		renderHeadToHtml(simpleHead, nonce)
	})

	bench("full head — title + description + custom meta + links", () => {
		renderHeadToHtml(fullHead, nonce)
	})
})
