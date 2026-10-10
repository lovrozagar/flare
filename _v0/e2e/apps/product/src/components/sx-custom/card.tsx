import type { JSX } from "@solidjs/web";
import { omit } from "solid-js";

type CardProps = JSX.HTMLAttributes<HTMLDivElement> & {
	children: JSX.Element;
};

/* Composition primitive — accepts outer class/style/data-* for consumer overrides */
export function SxCard(props: CardProps) {
	const rest = omit(props, "children", "class", "style");
	const local = props;

	return (
		<div
			{...rest}
			class={local.class}
			style={local.style}
			sx={{
				backgroundColor: "rgb(248, 248, 248)",
				border: "1px solid rgb(220, 220, 220)",
				borderRadius: "8px",
				padding: "16px",
			}}
		>
			{local.children}
		</div>
	);
}
