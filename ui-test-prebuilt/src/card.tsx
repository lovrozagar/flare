import { splitProps } from "solid-js"
import type { JSX } from "solid-js"
import "../dist/card.css"

type CardProps = JSX.HTMLAttributes<HTMLDivElement> & { children: JSX.Element }

/* Pre-built lib card — sx extracted at lib build time into dist/card.css */
export function PrebuiltCard(props: CardProps) {
	const [local, rest] = splitProps(props, ["children"])

	return (
		<div
			{...rest}
			/* a1-pc001 = background-color:rgb(245,250,245) — lib's sx layer */
			/* a1-pc002 = border:1px solid rgb(180,220,180) */
			/* a1-pc003 = border-radius:8px */
			/* a1-pc004 = padding:20px */
			class="a1-pc001 a1-pc002 a1-pc003 a1-pc004 prebuilt-card"
		>
			{local.children}
		</div>
	)
}
