import { Link } from "flare/link"
import { createPage } from "flare/page"

export const route = createPage("_root_/")
	.loader(() => ({
		message: "Hello from Flare",
		timestamp: Date.now(),
		visitToken: `visit-${Date.now()}`,
	}))
	.head(() => ({ title: "Home" }))
	.headers(({ loaderData }) => ({
		"set-cookie": `flare-visit=${(loaderData as { visitToken: string }).visitToken}; Path=/; SameSite=Lax`,
		"x-powered-by": "flare",
	}))
	.render((props) => (
		<main data-testid="home">
			<h1 data-testid="home-heading">{props.loaderData.message}</h1>
			<p data-testid="timestamp">{props.loaderData.timestamp}</p>
			<p data-testid="visit-token">{props.loaderData.visitToken}</p>
			<nav data-testid="nav-links">
				<Link to="/about">About</Link>
				<Link to="/dashboard">Dashboard</Link>
				<Link to="/dashboard/settings">Dashboard Settings</Link>
				<Link to="/context">Context</Link>
				<Link to="/styles">Styles</Link>
				<Link to="/old-page">Old Page</Link>
				<Link to="/deferred">Deferred</Link>
				<Link search={{ page: "2", q: "hello" }} to="/search">
					Search
				</Link>
				<Link params={{ id: "42" }} to="/users/[id]">
					User 42
				</Link>
				<Link params={{ id: "99" }} to="/users/[id]">
					User 99
				</Link>
				<Link to="/seo">SEO</Link>
				<Link to="/preloaded">Preloaded</Link>
				<Link to="/echo">Echo</Link>
				<Link to="/error-test">Error Test</Link>
				<Link to="/custom-headers">Headers</Link>
				<Link to="/link-features">Links</Link>
				<Link to="/xss">XSS</Link>
				<Link prefetch="intent" to="/prefetch-target">
					Prefetch
				</Link>
				<Link prefetch="intent" to="/prefetch-defer">
					Prefetch Defer
				</Link>
			</nav>
		</main>
	))
