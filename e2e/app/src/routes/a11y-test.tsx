import { Link } from "flare/link"
import { createPage } from "flare/page"

export const route = createPage("_root_/a11y-test")
	.head(() => ({ title: "A11y Test" }))
	.render(() => (
		<main aria-label="Accessibility test content" data-testid="a11y-page" id="main-content">
			<header data-testid="a11y-header">
				<h1 data-testid="page-heading">Accessibility Test Page</h1>
				<nav aria-label="Primary navigation" data-testid="a11y-nav">
					<Link to="/">Home</Link>
					<Link to="/about">About</Link>
				</nav>
			</header>
			<img alt="Decorative abstract pattern used as page banner" data-testid="hero-img" src="/photos/basic.jpg" />
			<form data-testid="a11y-form">
				<label for="a11y-email">Email</label>
				<input id="a11y-email" name="email" type="email" />
				<button type="submit">Send</button>
			</form>
		</main>
	))
