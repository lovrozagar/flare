import { Link } from "@lovrozagar/flare/link";
import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/")
	.cache({ cdn: { maxAge: "1d", swr: "7d", tags: ["fs-paths"] }, isr: true })
	.render(() => (
		<main data-testid="home">
			<h1>Home</h1>
			<nav data-testid="home-nav">
				<Link to="/about">About</Link>
				<Link to="/blog">Blog</Link>
				<Link params={{ slug: "hello" }} to="/blog/[slug]">
					Post
				</Link>
				<Link to="/login">Login</Link>
				<Link params={{ id: "42" }} to="/users/[id]">
					User
				</Link>
				<Link to="/deep-cache">Deep</Link>
				<Link prefetch={false} to="/deep-cache/uncached">
					Uncached
				</Link>
				<Link params={{ locale: undefined }} to="/optional-locale/[[locale]]">
					Opt locale
				</Link>
				<Link to="/_internal">Internal</Link>
				<Link prefetch={false} to="/dashboard">
					Dashboard
				</Link>
			</nav>
		</main>
	));
