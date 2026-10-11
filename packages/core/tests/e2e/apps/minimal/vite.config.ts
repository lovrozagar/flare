import { defineConfig, type ViteDevServer } from "vite";

export default defineConfig({
	server: { host: "127.0.0.1" },
	plugins: [
		{
			name: "minimal-dev",
			configureServer(dev: ViteDevServer) {
				dev.middlewares.use((_req, res) => {
					res.statusCode = 200;
					res.end("ok");
				});
			},
		},
	],
});
