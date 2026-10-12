import { defineConfig, type ViteDevServer } from "vite";

type AppServer = (typeof import("./src/server.ts"))["server"];

// The app server goes through Vite's transforms. Node alone cannot load the framework's .tsx sources.
export default defineConfig({
	cacheDir: process.env.FLARE_VITE_CACHE,
	server: { host: "127.0.0.1" },
	plugins: [
		{
			name: "basepath-dev",
			configureServer(dev: ViteDevServer) {
				dev.middlewares.use(async (req, res) => {
					const loaded = await dev.ssrLoadModule("/src/server.ts");
					const server: AppServer = loaded.server;
					const response = await server.fetch(new Request(`http://127.0.0.1${req.url ?? "/"}`));
					res.statusCode = response.status;
					res.end(await response.text());
				});
			},
		},
	],
});
