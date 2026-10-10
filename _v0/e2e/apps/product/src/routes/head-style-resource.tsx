import { createPage } from "@lovrozagar/flare/page";
import { isServer, useHead } from "@solidjs/web";
import { createSignal, Show } from "solid-js";

const STYLE_HREF = "flare-e2e-style-resource";
const STYLE_CLASS = "flare-e2e-hidden-scrollbar";

/*
 * A shared global rule registered the way component libraries hoist one
 * (e.g. Base UI's disable-scrollbar rule): a `<style href>` head resource
 * from every instance. Solid 2 dedupes it by `href`, emits it in the SSR
 * head with the render nonce, adopts it on hydration and keeps it for the
 * page's lifetime.
 */
/*
 * Solid's client `useHead` applies no nonce (the server render applies its
 * own), so a style first mounted on client navigation passes the page nonce
 * from Flare's `<meta name="csp-nonce">` — as a library should.
 */
function documentNonce(): string | undefined {
	if (isServer) return undefined;
	const meta = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]');
	return meta?.nonce || meta?.content || undefined;
}

function HiddenScrollbarBox(props: { testId: string }) {
	useHead(() => ({
		props: {
			nonce: documentNonce(),
			children: `.${STYLE_CLASS}{scrollbar-width:none}.${STYLE_CLASS}::-webkit-scrollbar{display:none}`,
			href: STYLE_HREF,
		},
		tag: "style",
	}));
	return (
		<div class={STYLE_CLASS} data-testid={props.testId} style={{ height: "40px", overflow: "scroll", width: "120px" }}>
			<div style={{ height: "200px" }} />
		</div>
	);
}

export const route = createPage("_root_/head-style-resource")
	.head(() => ({ title: "Head Style Resource" }))
	.render(() => {
		const [showSecond, setShowSecond] = createSignal(true);
		return (
			<main data-testid="head-style-resource">
				<h1>Head style resource</h1>
				<HiddenScrollbarBox testId="box-first" />
				<Show when={showSecond()}>
					<HiddenScrollbarBox testId="box-second" />
				</Show>
				<button data-testid="toggle-second" onClick={() => setShowSecond((v) => !v)} type="button">
					Toggle second
				</button>
			</main>
		);
	});
