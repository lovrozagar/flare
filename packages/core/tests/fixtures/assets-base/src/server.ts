export const server = {
	fetch: () =>
		new Response("<html><head></head><body></body></html>", {
			headers: { "content-type": "text/html" },
		}),
}
