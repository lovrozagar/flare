import { Link } from "@lovrozagar/flare/link";
import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/seo")
	.loader((ctx) => ({
		title: String(ctx.location.search.title ?? "Default Title"),
	}))
	.head((ctx) => ({
		canonical: "https://example.com/seo",
		description: `SEO test — ${(ctx.loaderData as { title: string }).title}`,
		meta: { author: "Flare" },
		openGraph: {
			description: "OG description",
			locale: "en_US",
			siteName: "Flare E2E",
			title: `OG: ${(ctx.loaderData as { title: string }).title}`,
			type: "website",
			url: "https://example.com/seo",
		},
		title: (ctx.loaderData as { title: string }).title,
		twitter: {
			card: "summary",
			description: "Twitter desc",
			title: `Twitter: ${(ctx.loaderData as { title: string }).title}`,
		},
	}))
	.render((props) => (
		<main data-testid="seo">
			<h1 data-testid="seo-heading">SEO</h1>
			<p data-testid="seo-title">{props.loaderData.title}</p>
			<nav>
				<Link to="/">Home</Link>
			</nav>
		</main>
	));
