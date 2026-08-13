import { createPage } from "flare/page"

export const route = createPage("_root_/seo")
	.loader((ctx) => {
		const title = String(ctx.location.search.title ?? "Default Title")
		return {
			platform: "CF Module",
			title,
			ts: Date.now(),
		}
	})
	.head((ctx) => ({
		canonical: "https://example.com/seo",
		description: `SEO test on CF Module — ${(ctx.loaderData as { title: string }).title}`,
		meta: {
			author: "CF Module Team",
		},
		openGraph: {
			description: "OG description for CF Module",
			locale: "en_US",
			siteName: "Flare on CF Module",
			title: `OG: ${(ctx.loaderData as { title: string }).title}`,
			type: "website",
			url: "https://example.com/seo",
		},
		title: (ctx.loaderData as { title: string }).title,
		twitter: {
			card: "summary",
			description: "Twitter desc for CF Module",
			title: `Twitter: ${(ctx.loaderData as { title: string }).title}`,
		},
	}))
	.render((props) => (
		<div>
			<h1 data-testid="seo-heading">SEO — CF Module</h1>
			<p data-testid="seo-title">{props.loaderData.title}</p>
			<p data-testid="seo-platform">{props.loaderData.platform}</p>
			<nav>
				<a href="/">Home</a>
			</nav>
		</div>
	))
