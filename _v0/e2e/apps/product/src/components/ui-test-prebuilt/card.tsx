import { omit } from "solid-js";
import type { JSX } from "@solidjs/web";
import "./card.css";

type CardProps = JSX.HTMLAttributes<HTMLDivElement> & { children: JSX.Element };

/* Pre-built lib card — sx extracted into card.css, not re-emitted by the app plugin. */
export function PrebuiltCard(props: CardProps) {
	const rest = omit(props, "children");
	const local = props;

	return (
		<div {...rest} class="a1-pc001 a1-pc002 a1-pc003 a1-pc004 prebuilt-card">
			{local.children}
		</div>
	);
}
