export type EnvName = "client" | "ssr" | "worker";

export type ClientBuild = { outDir: string; manifest: true; cssCodeSplit: false; assetsDir: string };
export type SsrBuild = { outDir: string; input: string };

export function environmentOrder(worker: boolean): EnvName[] {
	const order: EnvName[] = ["client", "ssr"];
	if (worker) order.push("worker");
	return order;
}

export function environmentBuild(options: { assetsBase?: string; assetsDir?: string } = {}): {
	client: ClientBuild;
	ssr: SsrBuild;
} {
	const assetsDir = options.assetsDir ?? "assets";
	const base = options.assetsBase ?? "/assets";
	if (base === "/" && assetsDir !== "assets") throw new Error("assets");
	return {
		client: { outDir: "dist/client", manifest: true, cssCodeSplit: false, assetsDir },
		ssr: { outDir: "dist/server", input: "server.js" },
	};
}
