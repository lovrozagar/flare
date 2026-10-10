import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/head-full")
	.loader(() => ({ year: 2026 }))
	.head((ctx) => ({
		canonical: "https://example.com/head-full",
		custom: {
			meta: [{ content: "flare-e2e-verify", name: "custom-verify" }],
		},
		description: `Full head config page - ${ctx.loaderData.year}`,
		favicons: {
			"192x192": "/icons/icon-192.png",
			"512x512": "/icons/icon-512.png",
			"96x96": "/icons/icon-96.png",
			appleTouchIcon: "/apple-touch-icon.png",
			ico: "/favicon.ico",
			svg: "/icon.svg",
		},
		images: [{ alt: "Top Level", height: 400, url: "https://example.com/top-level.jpg", width: 800 }],
		jsonLd: [
			{
				"@context": "https://schema.org",
				"@type": "WebPage",
				description: "Full head JSON-LD",
				name: "Head Full",
			},
			{
				"@context": "https://schema.org",
				"@type": "Organization",
				name: "Test Org",
				url: "https://example.com",
			},
		],
		keywords: "test, head, seo, flare",
		languages: {
			de: "https://example.com/de/head-full",
			en: "https://example.com/en/head-full",
			"x-default": "https://example.com/head-full",
		},
		meta: {
			author: "Flare Team",
			creator: "Flare Framework",
		},
		openGraph: {
			description: "Full OG description",
			images: [
				{
					alt: "Hero image",
					height: 630,
					type: "image/webp",
					url: "https://example.com/og-hero.jpg",
					width: 1200,
				},
				{ alt: "Thumb", height: 300, url: "https://example.com/og-thumb.jpg", width: 600 },
			],
			locale: "en_US",
			siteName: "Flare Test",
			title: "Head Full - OG",
			type: "article",
			url: "https://example.com/head-full",
		},
		robots: {
			follow: true,
			index: true,
			"max-image-preview": "large",
			"max-snippet": 160,
			noarchive: true,
		},
		title: "Head Full",
		twitter: {
			card: "summary_large_image",
			creator: "@flaredev",
			description: "Full Twitter description",
			site: "@flaresite",
			title: "Head Full - Twitter",
		},
	}))
	.render((props) => (
		<main data-testid="head-full">
			<h1>Head Full</h1>
			<p data-testid="head-full-year">{props.loaderData.year}</p>
		</main>
	));
