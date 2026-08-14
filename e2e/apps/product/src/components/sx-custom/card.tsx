import type { JSX } from "solid-js"
import { splitProps } from "solid-js"

type CardProps = JSX.HTMLAttributes<HTMLDivElement> & {
	children: JSX.Element
}

/* Composition primitive — accepts outer class/style/data-* for consumer overrides */
export function SxCard(props: CardProps) {
	const [local, rest] = splitProps(props, ["children", "class", "style"])

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
	)
}
