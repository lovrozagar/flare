import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
	title: "About",
};

export default function AboutPage() {
	return (
		<main>
			<h1>About</h1>
			<p>
				This is a minimal benchmark app comparing wire formats across Flare, Next.js, and TanStack Start. Same page,
				same data, different frameworks.
			</p>
			<p>
				<Link href="/">Back to posts</Link>
			</p>
		</main>
	);
}
