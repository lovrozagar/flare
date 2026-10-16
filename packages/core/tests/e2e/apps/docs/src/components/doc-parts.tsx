import { Image, Link } from "@lovrozagar/flare"
import { For, Show } from "solid-js"
import type { JSX } from "@solidjs/web"
import figure from "../assets/hero.jpg?image"
import type { Doc } from "../content.ts"

const DOC = "[[locale]]/_root_/(guide)/docs/[slug]"

// Hash links into this page's own sections. A hash change scrolls and fetches nothing.
export function Toc(props: { doc: Doc; locale: string | undefined; slug: string }): JSX.Element {
	return (
		<nav id="toc" class="mt-6 flex flex-wrap gap-2 text-sm" aria-label="On this page">
			<For each={props.doc.sections}>
				{(section) => (
					<Link
						to={DOC}
						params={{ locale: props.locale, slug: props.slug }}
						hash={section.id}
						class="rounded-full border border-stone-300 px-3 py-0.5 hover:border-flame-500 dark:border-ink-800"
					>
						{section.title}
					</Link>
				)}
			</For>
		</nav>
	)
}

export function Sections(props: { doc: Doc; locale: string | undefined }): JSX.Element {
	return (
		<>
			<Show when={props.doc.demo}>
				{(demo) => (
					<a
						id="demo-link"
						href={demo().path}
						class="mt-6 inline-flex rounded-lg bg-flame-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-flame-600"
					>
						Try it: {demo().label}
					</a>
				)}
			</Show>
			<For each={props.doc.sections}>
				{(section) => (
					<section id={section.id} class="mt-10 scroll-mt-24">
						<h2 class="text-xl font-semibold">{section.title}</h2>
						<p class="mt-2 leading-7 text-stone-700 dark:text-stone-300">{section.body}</p>
					</section>
				)}
			</For>
			<Show when={props.doc.see}>
				{(see) => (
					<Link
						id="see-also"
						to={DOC}
						params={{ locale: props.locale, slug: see().slug }}
						hash={see().hash}
						class="mt-10 inline-flex text-sm underline"
					>
						See also: {see().label}
					</Link>
				)}
			</Show>
		</>
	)
}

// A fixed-size image: a 1x and a 2x variant. The caption shows how many upstream calls the stats cost.
export function Figure(props: { stars: number; contributors: number; calls: number }): JSX.Element {
	return (
		<figure class="mt-8">
			<span id="figure">
				<Image src={figure} alt="Flare gradient" fixed width={480} height={270} />
			</span>
			<figcaption class="mt-2 text-xs text-stone-500">
				{props.stars} stars from {props.contributors} contributors, read with{" "}
				<span id="fetch-calls">{props.calls}</span> upstream call
			</figcaption>
		</figure>
	)
}

// Previous skips the view transition. Next is disabled on the last page and stays an anchor.
export function PrevNext(props: {
	locale: string | undefined
	slug: string
	prev: string | undefined
	next: string | undefined
}): JSX.Element {
	return (
		<div class="mt-10 flex items-center justify-between border-t border-stone-200 pt-6 dark:border-ink-800">
			<Show when={props.prev} fallback={<span />}>
				{(prev) => (
					<Link
						id="prev"
						to={DOC}
						params={{ locale: props.locale, slug: prev() }}
						viewTransition={false}
						class="text-sm hover:text-flame-600"
					>
						← {prev()}
					</Link>
				)}
			</Show>
			<Link
				id="next"
				to={DOC}
				params={{ locale: props.locale, slug: props.next ?? props.slug }}
				disabled={props.next === undefined}
				class="text-sm hover:text-flame-600 aria-disabled:opacity-40"
			>
				{props.next ?? "last page"} →
			</Link>
		</div>
	)
}
