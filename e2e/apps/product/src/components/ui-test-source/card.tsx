import { splitProps } from "solid-js";
import type { JSX } from "solid-js";

type CardProps = JSX.HTMLAttributes<HTMLDivElement> & { children: JSX.Element };

/* Source-only lib card — sx processed by the app Vite pipeline, not pre-extracted. */
export function SourceCard(props: CardProps) {
	const [local, rest] = splitProps(props, ["children"]);

	return (
		<div
			{...rest}
			class="source-card"
			sx={{
				backgroundColor: "rgb(240, 248, 255)",
				border: "1px solid rgb(160, 200, 240)",
				borderRadius: "8px",
				padding: "20px",
			}}
		>
			{local.children}
		</div>
	);
}
