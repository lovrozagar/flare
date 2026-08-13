import { createPage } from "flare/page"

export const route = createPage("_root_/head-demo")
	.head(() => ({
		canonical: "https://example.com/head-demo",
		description: "A page demonstrating complex head configuration",
		jsonLd: [
			{
				"@context": "https://schema.org",
				"@type": "WebPage",
				name: "Head Demo",
			},
		],
		openGraph: {
			description: "OG description for head demo",
			title: "Head Demo - OG",
			type: "website",
		},
		title: "Head Demo",
		twitter: {
			card: "summary",
			description: "Twitter description for head demo",
			title: "Head Demo - Twitter",
		},
	}))
	.render(() => (
		<main data-testid="head-demo">
			<h1>Head Demo</h1>
			<p>This page tests complex head configuration.</p>
		</main>
	))
