import { createLayout, Link, useMatch, ViewTransitionBoundary } from "@lovrozagar/flare";
import { For } from "solid-js";
import { docs } from "../../../../content.ts";

// The docs chrome. The group adds no URL segment. On a client navigation only the article animates: the boundary
// scopes the view transition to it, so the sidebar stays still.
export const route = createLayout("[[locale]]/_root_/(guide)")
	.cache({ client: { staleTime: "30s" } })
	.preloader(() => ({ section: "guide", sidebar: "docs" }))
	.render((props) => {
		const match = useMatch({ from: "[[locale]]/_root_/(guide)" });
		return (
			<div class="mx-auto flex max-w-6xl gap-10 px-5 py-10" data-guide-match={match.routeId}>
				<aside id="sidebar" class="sticky top-20 hidden h-fit w-52 shrink-0 md:block">
					<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Guide</p>
					<ul class="space-y-0.5">
						<For each={docs}>
							{(doc) => (
								<li>
									<Link
										to="[[locale]]/_root_/(guide)/docs/[slug]"
										params={{ locale: props.params.locale, slug: doc.slug }}
										class="block rounded-md px-2 py-1 text-sm text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"
										activeClass="bg-flame-500/10 font-medium text-flame-600 dark:text-flame-400"
										inactiveClass="opacity-90"
										activeProps={{ "data-active": "true" }}
										inactiveProps={{ "data-active": "false" }}
										prefetch={{ data: "intent" }}
									>
										{doc.title}
									</Link>
								</li>
							)}
						</For>
					</ul>
				</aside>
				<ViewTransitionBoundary>
					<article id="article" class="min-w-0 flex-1" style={{ "view-transition-name": "article" }}>
						{props.children}
					</article>
				</ViewTransitionBoundary>
			</div>
		);
	});
