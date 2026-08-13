import { createPage } from "flare/page"

export const route = createPage("_root_/seo")
	.loader((ctx) => {
		const title = String(ctx.location.search.title ?? "Default Title")
		return {
			platform: "Bun",
			title,
			ts: Date.now(),
		}
	})
	.head((ctx) => ({
		canonical: "https://example.com/seo",
		description: `SEO test on Bun — ${(ctx.loaderData as { title: string }).title}`,
		meta: {
			author: "Bun Team",
		},
		openGraph: {
			description: "OG description for Bun",
			locale: "en_US",
			siteName: "Flare on Bun",
			title: `OG: ${(ctx.loaderData as { title: string }).title}`,
			type: "website",
			url: "https://example.com/seo",
		},
		title: (ctx.loaderData as { title: string }).title,
		twitter: {
			card: "summary",
			description: "Twitter desc for Bun",
			title: `Twitter: ${(ctx.loaderData as { title: string }).title}`,
		},
	}))
	.render((props) => (
		<div>
			<h1 data-testid="seo-heading">SEO — Bun</h1>
			<p data-testid="seo-title">{props.loaderData.title}</p>
			<p data-testid="seo-platform">{props.loaderData.platform}</p>
			<nav>
				<a href="/">Home</a>
			</nav>
		</div>
	))
