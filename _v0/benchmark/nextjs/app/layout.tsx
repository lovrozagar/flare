import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
	title: "Next.js Benchmark",
};

export default function RootLayout(props: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>
				<nav>
					<Link href="/">Home</Link>
					{" | "}
					<Link href="/about">About</Link>
				</nav>
				{props.children}
			</body>
		</html>
	);
}
