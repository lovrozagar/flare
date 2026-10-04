import { createMemo, Show } from "solid-js";
import { createPage } from "@lovrozagar/flare/page";
import type { Font } from "@lovrozagar/flare/fonts";
import { createFont, FontCSS } from "@lovrozagar/flare/fonts";

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
};

export const route = createPage("_root_/fonts-dynamic")
	.input({
		searchParams: (sp: URLSearchParams) => ({
			body: sp.get("body") ?? "alpha",
			heading: sp.get("heading") ?? "beta",
		}),
	})
	.loader((ctx) => {
		/* server-side "DB" lookup — only selected fonts returned */
		const heading = fontDb[ctx.location.search.heading] ?? fontDb.alpha;
		const body = fontDb[ctx.location.search.body] ?? fontDb.alpha;

		return {
			bodyFamily: body?.fontFamily ?? "",
			headingFamily: heading?.fontFamily ?? "",
		};
	})
	.render((ctx) => {
		/* resolve fonts client-side from search params for FontCSS; location is reactive */
		const heading = createMemo(() => fontDb[ctx.location.search.heading] ?? fontDb.alpha);
		const body = createMemo(() => fontDb[ctx.location.search.body] ?? fontDb.alpha);

		return (
			<main data-testid="fonts-dynamic">
				<Show when={heading()}>{(font) => <FontCSS font={font()} />}</Show>
				<Show when={body() !== heading() && body()}>{(font) => <FontCSS font={font()} />}</Show>
				<h1 data-testid="dynamic-heading" style={{ "font-family": ctx.loaderData.headingFamily }}>
					Dynamic Heading
				</h1>
				<p data-testid="dynamic-body" style={{ "font-family": ctx.loaderData.bodyFamily }}>
					Dynamic body text
				</p>
				<p data-testid="heading-family">{ctx.loaderData.headingFamily}</p>
				<p data-testid="body-family">{ctx.loaderData.bodyFamily}</p>
			</main>
		);
	});
