import { serverFnMutationOptions, serverFnQueryOptions, useSuspenseQuery } from "@lovrozagar/flare/query";
import { useMutation } from "@tanstack/solid-query";
import { Errored, Loading } from "solid-js";
import type { JSX } from "@solidjs/web";
import { feedbackCount, vote } from "../fns/feedback.ts";
import { useUi } from "../i18n.ts";

function Tally(props: { slug: string }): JSX.Element {
	const ui = useUi();
	const key = (): readonly unknown[] => ["feedback", props.slug];
	const count = useSuspenseQuery(() =>
		serverFnQueryOptions(feedbackCount, { queryKey: key(), input: { slug: props.slug } }),
	);
	// With a mutation key, the helper writes the returned tally into the query under that key: no refetch.
	const mutation = useMutation(() => serverFnMutationOptions(vote, { mutationKey: key() }));
	const button =
		"rounded-md border border-stone-300 px-3 py-1 text-sm hover:border-flame-500 disabled:opacity-50 dark:border-ink-800";
	return (
		<div class="flex items-center gap-3 text-sm">
			<span class="text-stone-500">{ui("helpful")}</span>
			<button
				id="vote-up"
				type="button"
				class={button}
				disabled={mutation.isPending}
				onClick={() => mutation.mutate({ slug: props.slug, helpful: true })}
			>
				Yes <span id="votes-up">{count.data?.up}</span>
			</button>
			<button
				id="vote-down"
				type="button"
				class={button}
				disabled={mutation.isPending}
				onClick={() => mutation.mutate({ slug: props.slug, helpful: false })}
			>
				No <span id="votes-down">{count.data?.down}</span>
			</button>
		</div>
	);
}

// The query suspends under this boundary. The fallback is the skeleton. A failing widget shows its own line inside its
// own <Errored>, and the rest of the page stays (BUGS.md 64). A new slug is a new page, which the outlet remounts
// (B106), so the tally's query key never changes in place and solid-query's key-change relay (BUGS.md B39,
// TanStack/query#11903) is never reached.
export function Feedback(props: { slug: string }): JSX.Element {
	return (
		<Errored
			fallback={() => (
				<p id="feedback-error" class="text-sm text-stone-500">
					Feedback is unavailable.
				</p>
			)}
		>
			<Loading
				// A static skeleton: it renders inside the named article, where a running animation makes Firefox drop frames
				// during the entrance (dx/navigate.md, BUGS.md B61).
				fallback={<div id="feedback-loading" class="h-8 w-64 rounded bg-stone-200 dark:bg-ink-800" />}
			>
				<Tally slug={props.slug} />
			</Loading>
		</Errored>
	);
}
