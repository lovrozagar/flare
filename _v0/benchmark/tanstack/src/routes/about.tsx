import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
	component: AboutPage,
	head: () => ({
		meta: [{ title: "About" }],
	}),
});

function AboutPage() {
	return (
		<main>
			<h1>About</h1>
			<p>
				This is a minimal benchmark app comparing wire formats across Flare, Next.js, and TanStack Start. Same page,
				same data, different frameworks.
			</p>
			<p>
				<Link to="/">Back to posts</Link>
			</p>
		</main>
	);
}
