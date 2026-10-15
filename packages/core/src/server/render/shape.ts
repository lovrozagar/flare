// A document holds `<html` and `</body>`: what a production shell must hold (B37) and what a shared write stores (B46).
export function isDocument(html: string): boolean {
	return html.includes("<html") && html.includes("</body>")
}

// A production shell the root layout wrote without `<html` or without `</body>` (B37).
export class DocumentlessRoot extends Error {
	readonly root: string

	constructor(root: string) {
		super(`root layout "${root}" rendered no <html> or </body> (B37)`)
		this.root = root
	}
}
