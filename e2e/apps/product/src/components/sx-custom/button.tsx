import { omit } from "solid-js";
import type { JSX } from "@solidjs/web";

type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: "primary" | "secondary" | "danger";
};

/* lib-style Button — uses splitProps so consumer style/data-* attrs forward cleanly */
export function SxButton(props: ButtonProps) {
	const rest = omit(props, "variant");

	return (
		<button
			{...rest}
			class="sx-custom-btn"
			sx={{
				backgroundColor: "rgb(0, 80, 200)",
				borderRadius: "4px",
				color: "rgb(255, 255, 255)",
				cursor: "pointer",
				padding: "8px 16px",
			}}
			type={props.type ?? "button"}
		>
			{props.children}
		</button>
	);
}
