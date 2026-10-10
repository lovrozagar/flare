import { Link } from "@lovrozagar/flare/link";
import { createPage } from "@lovrozagar/flare/page";
import {
	useBlocker,
	useLoaderData,
	useLocation,
	useMatch,
	useNavigate,
	useParams,
	useSearch,
} from "@lovrozagar/flare/router";
import { createSignal, Show } from "solid-js";

export const route = createPage("_root_/hooks-test")
	.loader(() => ({
		greeting: "hello from hooks",
		timestamp: Date.now(),
	}))
	.render(() => {
		const data = useLoaderData({ from: "_root_/hooks-test" });
		const location = useLocation();
		const match = useMatch({ from: "_root_/hooks-test" });
		const navigate = useNavigate();
		const params = useParams({ from: "_root_/hooks-test" });
		const search = useSearch({ from: "_root_/hooks-test" });
		const [dirty, setDirty] = createSignal(false);
		const blocker = useBlocker(() => dirty());
		const [navigated, setNavigated] = createSignal(false);

		return (
			<main data-testid="hooks-test">
				<h1>Standalone Hooks Test</h1>

				{/* useLoaderData */}
				<section data-testid="loader-section">
					<p data-testid="loader-greeting">{data().greeting}</p>
					<p data-testid="loader-timestamp">{data().timestamp}</p>
				</section>

				{/* useLocation */}
				<section data-testid="location-section">
					<p data-testid="location-pathname">{location().pathname}</p>
					<p data-testid="location-virtualpath">{location().virtualPath}</p>
				</section>

				{/* useMatch */}
				<section data-testid="match-section">
					<p data-testid="match-exists">{match() ? "matched" : "no-match"}</p>
					<p data-testid="match-virtualpath">{match()?.virtualPath ?? "none"}</p>
				</section>

				{/* useParams — no dynamic segments on this route, so empty */}
				<section data-testid="params-section">
					<p data-testid="params-json">{JSON.stringify(params())}</p>
				</section>

				{/* useSearch */}
				<section data-testid="search-section">
					<p data-testid="search-json">{JSON.stringify(search())}</p>
				</section>

				{/* useNavigate */}
				<section data-testid="navigate-section">
					<button
						data-testid="navigate-btn"
						onClick={() => {
							setNavigated(true);
							navigate({ search: { filter: "active" }, to: "/hooks-test" });
						}}
						type="button"
					>
						Navigate with search
					</button>
					<p data-testid="navigate-called">{navigated() ? "true" : "false"}</p>
				</section>

				{/* useBlocker */}
				<section data-testid="blocker-section">
					<button data-testid="toggle-dirty" onClick={() => setDirty((v) => !v)} type="button">
						{dirty() ? "Dirty" : "Clean"}
					</button>
					<p data-testid="dirty-state">{dirty() ? "dirty" : "clean"}</p>
					<p data-testid="blocked-state">{blocker.blocked() ? "blocked" : "not-blocked"}</p>
					<button data-testid="proceed-btn" onClick={() => blocker.proceed()} type="button">
						Proceed
					</button>
					<button data-testid="reset-btn" onClick={() => blocker.reset()} type="button">
						Reset
					</button>
				</section>

				<Show when={blocker.blocked()}>
					<div data-testid="block-dialog">Navigation blocked!</div>
				</Show>

				<Link data-testid="about-link" to="/about">
					Go to About
				</Link>
			</main>
		);
	});
