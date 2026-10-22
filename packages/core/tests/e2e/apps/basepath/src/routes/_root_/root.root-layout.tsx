import { createRootLayout, Link, useNavigate } from "@lovrozagar/flare"
import type { JSX } from "@solidjs/web"

// A button that navigates in code, beside the Link, so both ways of leaving a page build their URL under the base
// (plan 21 3.7, plan 35).
function GoAbout(): JSX.Element {
	const navigate = useNavigate()
	return (
		<button id="go-about" type="button" onClick={() => void navigate({ to: "_root_/about" })}>
			Go to about
		</button>
	)
}

// A production root renders the whole document, or every page is a 500 (B37).
export const route = createRootLayout("_root_").render((props) => (
	<html lang="en">
		<head>
			<title>Basepath</title>
		</head>
		<body>
			<nav>
				<Link id="to-about" to="_root_/about">
					About
				</Link>
				<GoAbout />
			</nav>
			<main id="app">{props.children}</main>
		</body>
	</html>
))
