import { HeadContent, Link, Scripts, createRootRoute } from "@tanstack/react-router"

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ content: "width=device-width, initial-scale=1", name: "viewport" },
		],
	}),
	shellComponent: RootDocument,
})

function RootDocument(props: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<nav>
					<Link to="/">Home</Link>
					{" | "}
					<Link to="/about">About</Link>
				</nav>
				{props.children}
				<Scripts />
			</body>
		</html>
	)
}
