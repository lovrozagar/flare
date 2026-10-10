import { omit } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Dynamic } from "@solidjs/web";

type ButtonSlotProps = {
	/** Render as any HTML tag. Defaults to "button". */
	as?: keyof JSX.IntrinsicElements;
	children?: JSX.Element;
	class?: string;
	style?: JSX.CSSProperties;
	/* allow arbitrary HTML attrs (href, type, aria-*, data-*, etc.) */
	[key: string]: unknown;
};

/* Polymorphic button — lib sx in user.lib layer, consumer style/class always wins */
export function ButtonSlot(props: ButtonSlotProps) {
	const rest = omit(props, "as");
	const local = props;

	return (
		<Dynamic
			component={local.as ?? "button"}
			{...rest}
			class={props.class ?? "flare-ui-btn-slot"}
			sx={{
				padding: "10px 18px",
				backgroundColor: "rgb(0, 120, 200)",
				color: "rgb(255, 255, 255)",
				borderRadius: "6px",
				border: "none",
				cursor: "pointer",
				fontSize: "14px",
			}}
		>
			{props.children}
		</Dynamic>
	);
}
