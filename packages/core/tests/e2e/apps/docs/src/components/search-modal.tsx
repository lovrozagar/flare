import { InterceptOutlet } from "@lovrozagar/flare";
import type { JSX } from "@solidjs/web";

// A client navigation to search from a page in its `from` list opens here, over the page that stays mounted.
// `match.render` runs the search page itself inside the dialog.
export function SearchModal(): JSX.Element {
	return (
		<InterceptOutlet>
			{(state) => (
				<div class="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-6 pt-24 backdrop-blur-sm">
					<div
						id="search-modal"
						role="dialog"
						aria-label="Search"
						data-label={state.render}
						data-background={state.backgroundLocation.pathname}
						class="w-full max-w-xl animate-rise rounded-xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-ink-800 dark:bg-ink-900"
					>
						<div class="mb-3 flex items-center justify-between">
							<p class="text-xs uppercase tracking-wide text-stone-500">Quick search</p>
							<button
								id="modal-close"
								type="button"
								class="rounded px-2 py-1 text-sm hover:bg-stone-100 dark:hover:bg-ink-800"
								onClick={() => state.dismiss()}
							>
								Close
							</button>
						</div>
						{state.match.render()}
					</div>
				</div>
			)}
		</InterceptOutlet>
	);
}
