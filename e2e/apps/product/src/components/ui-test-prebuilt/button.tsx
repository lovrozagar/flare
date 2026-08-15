import { splitProps } from "solid-js";
import type { JSX } from "solid-js";
import "./button.css";

type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement>;

/* Pre-built lib button — sx extracted into button.css, not re-emitted by the app plugin. */
export function PrebuiltButton(props: ButtonProps) {
	const [, rest] = splitProps(props, []);

	return (
		<button {...rest} class="a1-pb001 a1-pb002 a1-pb003 a1-pb004 a1-pb005 prebuilt-btn" type={props.type ?? "button"}>
			{props.children}
		</button>
	);
}
