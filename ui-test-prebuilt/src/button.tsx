import { splitProps } from "solid-js"
import type { JSX } from "solid-js"
import "../dist/button.css"

type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement>

/* Pre-built lib button — sx extracted at lib build time into dist/button.css */
export function PrebuiltButton(props: ButtonProps) {
	const [, rest] = splitProps(props, [])

	return (
		<button
			{...rest}
			/* a1-pb001 = background-color:rgb(0,120,80) — lib's sx layer */
			/* a1-pb002 = color:rgb(255,255,255) */
			/* a1-pb003 = border-radius:6px */
			/* a1-pb004 = padding:8px 20px */
			/* a1-pb005 = cursor:pointer */
			class="a1-pb001 a1-pb002 a1-pb003 a1-pb004 a1-pb005 prebuilt-btn"
			type={props.type ?? "button"}
		>
			{props.children}
		</button>
	)
}
