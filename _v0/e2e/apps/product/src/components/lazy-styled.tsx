import { styles } from "@lovrozagar/flare/styles";

export default function LazyStyled() {
	const props = styles("lazy-styled-box", {
		css: "color: rgb(0, 100, 200); padding: 16px; border: 2px dashed rgb(0, 100, 200);",
	});
	return (
		<div {...props} data-testid="lazy-styled-box">
			Lazy Styled Component
		</div>
	);
}
