/** Leave the SPA: the browser loads `href` as a new document. */
export function navigateDocument(href: string): void {
	if (typeof window !== "undefined") window.location.href = href;
}
