import { styles } from "flare/styles"

export default function ClientLazyStyled() {
	const props = styles("client-lazy-box", {
		css: "color: rgb(200, 0, 100); font-size: 18px; background: rgb(255, 240, 245);",
	})
	return (
		<div {...props} data-testid="client-lazy-box">
			Client Lazy Styled
		</div>
	)
}
