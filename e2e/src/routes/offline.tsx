import { createPage } from "flare/page"

export const route = createPage("_root_/offline")
	.loader(() => ({ offline: true }))
	.head(() => ({
		title: "Offline",
	}))
	.render((props) => {
		return (
			<main data-testid="offline-page">
				<h1>You're offline</h1>
				<p data-testid="offline-message">Please check your internet connection.</p>
			</main>
		)
	})
