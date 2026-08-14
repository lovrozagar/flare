import { createPage } from "flare/page"
import type { Font } from "flare/fonts"
import { createFont, FontCSS } from "flare/fonts"

/* simulated "font DB" — in real SaaS this comes from tenant config */
const fontDb: Record<string, Font> = {
	alpha: createFont({
		category: "sans-serif",
		family: "Alpha Sans",
		src: "/fonts/alpha-sans.woff2",
		weights: "100 900",
	}),
	beta: createFont({
		category: "serif",
		family: "Beta Serif",
		src: "/fonts/beta-serif.woff2",
		weights: [400, 700],
	}),
	gamma: createFont({
		category: "monospace",
		family: "Gamma Mono",
		src: "/fonts/gamma-mono.woff2",
		weights: "400",
	}),
}

export const route = createPage("_root_/fonts-dynamic")
	.input({
		searchParams: (sp: URLSearchParams) => ({
			body: sp.get("body") ?? "alpha",
			heading: sp.get("heading") ?? "beta",
		}),
	})
	.loader((ctx) => {
		/* server-side "DB" lookup — only selected fonts returned */
		const heading = fontDb[ctx.location.search.heading] ?? fontDb.alpha
		const body = fontDb[ctx.location.search.body] ?? fontDb.alpha

		return {
			bodyFamily: body?.fontFamily ?? "",
			headingFamily: heading?.fontFamily ?? "",
		}
	})
	.render((ctx) => {
		/* resolve fonts client-side from search params for FontCSS */
		const headingKey = ctx.location.search.heading
		const bodyKey = ctx.location.search.body
		const heading = fontDb[headingKey] ?? fontDb.alpha
		const body = fontDb[bodyKey] ?? fontDb.alpha

		return (
			<main data-testid="fonts-dynamic">
				{heading ? <FontCSS font={heading} /> : null}
				{body && heading !== body ? <FontCSS font={body} /> : null}
				<h1 data-testid="dynamic-heading" style={{ "font-family": ctx.loaderData.headingFamily }}>
					Dynamic Heading
				</h1>
				<p data-testid="dynamic-body" style={{ "font-family": ctx.loaderData.bodyFamily }}>
					Dynamic body text
				</p>
				<p data-testid="heading-family">{ctx.loaderData.headingFamily}</p>
				<p data-testid="body-family">{ctx.loaderData.bodyFamily}</p>
			</main>
		)
	})
