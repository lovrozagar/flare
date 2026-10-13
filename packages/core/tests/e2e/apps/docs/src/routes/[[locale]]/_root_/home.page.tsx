import { createPage, Image, Link } from "@lovrozagar/flare";
import { useLoaderT } from "@lovrozagar/flare/i18n";
import { For } from "solid-js";
import hero from "../../../assets/hero.jpg?image";
import { docs } from "../../../content.ts";
import { messages } from "../../../i18n.ts";

// A tiny inline preview the hero shows until the optimized file has loaded.
const BLUR =
	"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiA5Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgyPSIxIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iI2Y5NzMxNiIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzYzNjZmMSIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSIxNiIgaGVpZ2h0PSI5IiBmaWxsPSJ1cmwoI2cpIi8+PC9zdmc+";

// Prerendered once per locale at build. The CDN may hold it for a minute.
export const route = createPage("[[locale]]/_root_/")
	.cache({
		ssg: (): Record<string, string>[] => [{}, { locale: "hr" }, { locale: "ar" }],
		cdn: { maxAge: "1m", swr: "1h" },
	})
	.loader(() => {
		const t = useLoaderT(messages);
		return { message: t("hello"), tagline: t("tagline") };
	})
	.head(() => ({ title: "Flare docs — every feature, one page each" }))
	.render((props) => (
		<main>
			<section class="relative isolate overflow-hidden">
				<Image src={hero} alt="" fill priority placeholder="blur" blurDataURL={BLUR} sizes="100vw" />
				<div class="relative mx-auto max-w-6xl px-5 pb-24 pt-28 text-white">
					<p class="inline-flex rounded-full bg-white/15 px-3 py-1 text-sm backdrop-blur">
						<span id="message">{props.loaderData.message}</span>
					</p>
					<h1 class="mt-5 max-w-2xl text-5xl font-semibold tracking-tight">Flare</h1>
					<p class="mt-4 max-w-xl text-lg text-white/85">{props.loaderData.tagline}</p>
					<div class="mt-8 flex gap-3">
						<Link
							to="[[locale]]/_root_/(guide)/docs/[slug]"
							params={{ locale: props.params.locale, slug: "routing" }}
							class="rounded-lg bg-white px-4 py-2 font-medium text-ink-950 hover:bg-amber-100"
						>
							Read the docs
						</Link>
						<Link
							to="[[locale]]/_root_/playground"
							params={{ locale: props.params.locale }}
							prefetch={false}
							class="rounded-lg border border-white/40 px-4 py-2 font-medium hover:bg-white/10"
						>
							Open the playground
						</Link>
					</div>
				</div>
			</section>
			<section class="mx-auto grid max-w-6xl gap-4 px-5 py-14 sm:grid-cols-2 lg:grid-cols-3">
				<For each={docs}>
					{(doc) => (
						<Link
							to="[[locale]]/_root_/(guide)/docs/[slug]"
							params={{ locale: props.params.locale, slug: doc.slug }}
							prefetch="viewport"
							data-feature={doc.slug}
							class="group rounded-xl border border-stone-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-flame-400 hover:shadow-lg dark:border-ink-800 dark:bg-ink-900"
						>
							<h2 class="font-semibold group-hover:text-flame-600 dark:group-hover:text-flame-400">{doc.title}</h2>
							<p class="mt-1.5 text-sm text-stone-500">{doc.summary}</p>
						</Link>
					)}
				</For>
			</section>
		</main>
	));
