import { createRootLayout, Link } from "@lovrozagar/flare";

// The nav stays mounted across client navigations and stays on screen when the page scrolls. The spacer makes
// the page tall enough to scroll.
export const route = createRootLayout("_root_").render((props) => (
	<html lang="en">
		<head>
			<title>Minimal</title>
		</head>
		<body>
			<nav id="nav" style={{ position: "fixed", top: "0", left: "0" }}>
				<Link to="_root_/">Home</Link>
				<Link to="_root_/about">About</Link>
			</nav>
			<div id="app">{props.children}</div>
			<div id="spacer" style={{ height: "4000px" }} />
		</body>
	</html>
));
