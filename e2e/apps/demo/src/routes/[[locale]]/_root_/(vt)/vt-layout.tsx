import { createSignal } from "solid-js";
import { createLayout } from "@lovrozagar/flare/layout";
import { Link } from "@lovrozagar/flare/link";
import { ViewTransitionBoundary } from "@lovrozagar/flare/view-transition-boundary";

/* A persistent shell: navigations inside it should animate only <main>. */
export const route = createLayout("[[locale]]/_root_/(vt)").render((props) => {
	const [clicks, setClicks] = createSignal(0);
	return (
		<div data-testid="vt-shell" style={{ display: "flex", gap: "16px" }}>
			{/* Hover wins over the resting color and animates, like a real sidebar. */}
			<style>{`[data-testid="vt-sidebar"] a { display: block; color: rgb(0, 0, 255); transition: color 150ms; }
[data-testid="vt-sidebar"] a:hover { color: rgb(255, 0, 0); }`}</style>
			<aside data-testid="vt-sidebar">
				<Link data-testid="vt-link-a" params={{ locale: undefined }} to="/[[locale]]/vt-shell/a">
					A
				</Link>
				<Link data-testid="vt-link-b" params={{ locale: undefined }} to="/[[locale]]/vt-shell/b">
					B
				</Link>
				<Link data-testid="vt-link-1" params={{ id: "1", locale: undefined }} to="/[[locale]]/vt-shell/[id]">
					Item 1
				</Link>
				<Link data-testid="vt-link-2" params={{ id: "2", locale: undefined }} to="/[[locale]]/vt-shell/[id]">
					Item 2
				</Link>
				<Link
					data-testid="vt-link-doc"
					params={{ locale: undefined }}
					to="/[[locale]]/vt-shell/b"
					viewTransition={{ scope: "document" }}
				>
					B (document transition)
				</Link>
				<Link data-testid="vt-link-out" params={{ locale: undefined }} to="/[[locale]]/about">
					Leave the shell
				</Link>
			</aside>
			<ViewTransitionBoundary>
				<main data-testid="vt-main">{props.children}</main>
			</ViewTransitionBoundary>
			{/* Hydrates after the boundary: proves the boundary does not shift hydration ids. */}
			<button data-testid="vt-after" onClick={() => setClicks((n) => n + 1)} type="button">
				clicks {clicks()}
			</button>
		</div>
	);
});
