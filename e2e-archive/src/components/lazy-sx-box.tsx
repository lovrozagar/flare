export default function LazySxBox() {
	return (
		<div
			data-testid="lazy-sx-box"
			sx={{ color: "rgb(0, 100, 200)", fontSize: "22px", fontWeight: "700" }}
		>
			Lazy sx component
		</div>
	)
}
