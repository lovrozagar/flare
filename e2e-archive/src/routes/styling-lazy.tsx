import { createPage } from "flare/page"
import { styles } from "flare/styles"
import { clientLazy, lazy } from "flare/lazy"

const LazyStyled = lazy({
	loader: () => import("../components/lazy-styled"),
	pending: () => <span data-testid="lazy-styled-pending">Loading styled...</span>,
})

const ClientLazyStyled = clientLazy({
	loader: () => import("../components/client-lazy-styled"),
	pending: () => <span data-testid="client-lazy-pending">Loading client styled...</span>,
})

export const route = createPage("_root_/styling-lazy").render(() => {
	const pageProps = styles("lazy-page-box", {
		css: "padding: 8px; background: rgb(245, 245, 245);",
	})
	return (
		<main data-testid="styling-lazy">
			<div {...pageProps} data-testid="lazy-page-box">
				Page-level scoped
			</div>
			<section data-testid="lazy-section">
				<LazyStyled />
			</section>
			<section data-testid="client-lazy-section">
				<ClientLazyStyled />
			</section>
		</main>
	)
})
