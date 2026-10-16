import { createLayout, notFound } from "@lovrozagar/flare"

// A layout whose loader throws notFound() on /area-missing: a client navigation there paints the layout's own
// notFoundRender in the layout's slot, without the layout's chrome (B77, BUGS.md 134).
export const route = createLayout("_root_/(area)")
	.loader(({ request }) => {
		if (new URL(request.url).pathname === "/area-missing") throw notFound()
		return {}
	})
	.render((props) => <section id="area">{props.children}</section>)
	.notFoundRender(() => <p id="area-missing">area missing</p>)
