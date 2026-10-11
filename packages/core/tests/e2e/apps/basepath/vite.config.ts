import { defineConfig, type ViteDevServer } from "vite";

const home =
	'<!doctype html><html><body><div id="app">Home</div><script>document.documentElement.setAttribute("data-flare-hydrated","")</script></body></html>';

export default defineConfig({
	server: { host: "127.0.0.1" },
	plugins: [
		{
			name: "basepath-dev",
			configureServer(dev: ViteDevServer) {
				dev.middlewares.use((req, res) => {
					const path = req.url?.split("?")[0];
					if (path === "/app") {
						res.statusCode = 200;
						res.end(home);
						return;
					}
					res.statusCode = 404;
					res.end("missing");
				});
			},
		},
	],
});
