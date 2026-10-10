import { omit } from "solid-js";
import type { JSX } from "@solidjs/web";

type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement>;

/* Source-only lib button — sx processed by the app Vite pipeline, not pre-extracted. */
export function SourceButton(props: ButtonProps) {
	const rest = props;

	return (
		<button
			{...rest}
			class="source-btn"
			sx={{
				backgroundColor: "rgb(30, 90, 180)",
				borderRadius: "5px",
				color: "rgb(255, 255, 255)",
				cursor: "pointer",
				padding: "8px 18px",
			}}
			type={props.type ?? "button"}
		>
			{props.children}
		</button>
	);
}
