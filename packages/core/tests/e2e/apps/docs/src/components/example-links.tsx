import { Link, useNavigate } from "@lovrozagar/flare";
import { For } from "solid-js";
import type { JSX } from "@solidjs/web";

const ID = "[[locale]]/_root_/(guide)/examples/[[...rest]]";
export const TABS = ["routes", "data", "cache"] as const;
export type Tab = (typeof TABS)[number];

type Where = { locale: string | undefined; rest: string[] | undefined; tab: Tab | undefined };

// Tab links change one search key on the same route, so each is a new match.
export function Tabs(props: Where): JSX.Element {
	return (
		<div class="mt-6 flex gap-2" role="tablist">
			<For each={TABS}>
				{(tab) => (
					<Link
						id={`tab-${tab}`}
						to={ID}
						params={{ locale: props.locale, rest: props.rest }}
						search={{ tab }}
						class="rounded-md px-3 py-1 text-sm"
						activeClass="bg-flame-500 text-white"
						inactiveClass="bg-stone-200 dark:bg-ink-800"
					>
						{tab}
					</Link>
				)}
			</For>
		</div>
	);
}

// Shallow, revalidate, a deeper catch-all, a replace with history state, and the client rewrite alias.
export function Actions(props: Where): JSX.Element {
	const navigate = useNavigate();
	const search = (): { tab?: Tab } => (props.tab === undefined ? {} : { tab: props.tab });
	return (
		<div class="mt-6 flex flex-wrap gap-3 text-sm">
			<Link
				id="shallow-note"
				to={ID}
				params={{ locale: props.locale, rest: props.rest }}
				search={{ ...search(), note: "shallow" }}
				shallow
				scroll={false}
				class="underline"
			>
				Shallow: add a note
			</Link>
			<Link
				id="revalidate"
				to={ID}
				params={{ locale: props.locale, rest: props.rest }}
				search={search()}
				revalidate
				force
				class="underline"
			>
				Revalidate
			</Link>
			<Link id="deep-example" to={ID} params={{ locale: props.locale, rest: ["a", "b"] }} class="underline">
				/examples/a/b
			</Link>
			<button
				id="navigate-state"
				type="button"
				class="underline"
				onClick={() =>
					void navigate({
						to: ID,
						params: { locale: props.locale, rest: ["state"] },
						search: { tab: "data" },
						replace: true,
						state: { from: "examples" },
					})
				}
			>
				navigate with state
			</button>
			<a id="guide-alias" href="/guide/routing" class="underline">
				/guide/routing (client rewrite)
			</a>
		</div>
	);
}
