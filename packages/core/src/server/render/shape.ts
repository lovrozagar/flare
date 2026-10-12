export function shapeDocument(html: string): { status: number; body: string } {
	if (process.env["NODE_ENV"] !== "production") return { status: 200, body: html };
	if (html.includes("<html") && html.includes("</body>")) return { status: 200, body: html };
	return { status: 500, body: "Internal Server Error" };
}
