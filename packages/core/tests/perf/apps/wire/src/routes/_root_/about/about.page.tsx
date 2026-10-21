import { createPage, Link } from "@lovrozagar/flare"

export const route = createPage("_root_/about")
	.head(() => ({ title: "About" }))
	.render(() => (
		<main>
			<h1>About</h1>
			<p>
				This is a minimal benchmark app comparing wire formats across Flare, Next.js, and TanStack Start. Same page,
				same data, different frameworks.
			</p>
			<p>
				<Link to="_root_/">Back to posts</Link>
			</p>
		</main>
	))
