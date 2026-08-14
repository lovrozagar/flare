import { createPage } from "flare/page"

export const route = createPage("_root_/head-full")
	.head(() => ({
		canonical: "https://example.com/head-full",
		description: '<script>alert("xss")</script> desc',
		jsonLd: [{ "@type": "WebPage", name: "Head Full" }],
		keywords: "flare,e2e",
		openGraph: {
			images: [{ url: "https://example.com/og.png" }],
			title: "OG Full",
			type: "website",
		},
		title: "Head Full",
		twitter: { card: "summary", title: "Tw Full" },
	}))
	.render(() => (
		<main data-testid="head-full">
			<h1>Head Full</h1>
		</main>
	))
