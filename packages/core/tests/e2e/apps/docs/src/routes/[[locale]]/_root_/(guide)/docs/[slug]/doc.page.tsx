import { createPage } from "@lovrozagar/flare";
import { CodeBlock } from "../../../../../../components/code-block.tsx";
import { Figure, PrevNext, Sections, Toc } from "../../../../../../components/doc-parts.tsx";
import { Feedback } from "../../../../../../components/feedback.tsx";
import { HooksPanel } from "../../../../../../components/hooks-panel.tsx";
import { docOf, docs } from "../../../../../../content.ts";
import { readStats } from "../../../../../../stats.ts";

const LOCALES: readonly Record<string, string>[] = [{}, { locale: "hr" }, { locale: "ar" }];

// One page per doc, prerendered for every slug in every locale. A slug outside the list is the router's 404.
export const route = createPage("[[locale]]/_root_/(guide)/docs/[slug]")
	.cache({ ssg: () => LOCALES.flatMap((locale) => docs.map((doc) => ({ ...locale, slug: doc.slug }))) })
	.input({
		params: (raw: Record<string, string | string[]>) => ({
			locale: typeof raw["locale"] === "string" ? raw["locale"] : undefined,
			slug: String(raw["slug"]).toLowerCase(),
		}),
	})
	.preloader(({ params }) => ({
		section: "docs page",
		toc: (docOf(params.slug)?.sections ?? []).map((section) => section.id),
	}))
	.loader(async ({ params }) => {
		// SSG answers 404 for a slug its params did not list, so the loader only sees listed slugs.
		const doc = docOf(params.slug);
		if (doc === undefined) throw new Error(`no doc ${params.slug}`);
		const { stats, calls } = await readStats();
		const index = docs.indexOf(doc);
		return {
			doc,
			stats,
			fetchCalls: calls,
			prev: docs[index - 1]?.slug,
			next: docs[index + 1]?.slug,
		};
	})
	.head((ctx) => ({
		title: `${ctx.loaderData.doc.title} — Flare docs`,
		description: ctx.loaderData.doc.summary,
		canonical: `https://flare.test/docs/${ctx.params.slug}`,
	}))
	.render((props) => (
		<div class="animate-rise">
			<p class="text-sm text-flame-600 dark:text-flame-400">Guide</p>
			<h1 id="doc-title" class="mt-1 text-3xl font-semibold tracking-tight">
				{props.loaderData.doc.title}
			</h1>
			<p class="mt-3 text-lg text-stone-600 dark:text-stone-400">{props.loaderData.doc.summary}</p>
			<Toc doc={props.loaderData.doc} locale={props.params.locale} slug={props.params.slug} />
			<Sections doc={props.loaderData.doc} />
			<div class="mt-8">
				<CodeBlock code={props.loaderData.doc.code} />
			</div>
			<Figure
				stars={props.loaderData.stats.stars}
				contributors={props.loaderData.stats.contributors}
				calls={props.loaderData.fetchCalls}
			/>
			<PrevNext
				locale={props.params.locale}
				slug={props.params.slug}
				prev={props.loaderData.prev}
				next={props.loaderData.next}
			/>
			<div class="mt-8">
				<Feedback slug={props.params.slug} />
			</div>
			<HooksPanel />
		</div>
	));
