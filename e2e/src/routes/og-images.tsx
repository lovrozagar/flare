import { createPage } from "flare/page"

export const route = createPage("_root_/og-images")
	.head(() => ({
		openGraph: {
			description: "Page with multiple OG images",
			images: [
				{ height: 400, url: "https://example.com/img1.jpg", width: 800 },
				{ height: 300, url: "https://example.com/img2.jpg", width: 600 },
			],
			title: "OG Images Demo",
			type: "website",
		},
		title: "OG Images",
	}))
	.render(() => (
		<div data-testid="og-images-page">
			<h1>OG Images Demo</h1>
			<p>This page has multiple OG images for testing.</p>
		</div>
	))
