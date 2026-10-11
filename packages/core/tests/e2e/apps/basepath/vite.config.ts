import { defineConfig, type ViteDevServer } from "vite";
import { server } from "./src/server.ts";

export default defineConfig({
	cacheDir: process.env.FLARE_VITE_CACHE,
	server: { host: "127.0.0.1" },
	plugins: [
		{
			name: "basepath-dev",
			configureServer(dev: ViteDevServer) {
				dev.middlewares.use(async (req, res) => {
					const response = await server.fetch(new Request(`http://127.0.0.1${req.url ?? "/"}`));
					res.statusCode = response.status;
					res.end(await response.text());
				});
			},
		},
	],
});
