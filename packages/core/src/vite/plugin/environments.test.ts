import { expect, it } from "vitest";
import { clientUrl, environmentBuild, environmentOrder } from "./environments.ts";

it("defaults", () => {
	const build = environmentBuild();
	expect(build.client).toEqual({ outDir: "dist/client", manifest: true, cssCodeSplit: false, assetsDir: "assets" });
	expect(`${build.ssr.outDir}/${build.ssr.input}`).toBe("dist/server/server.js");
});

it("assets dir", () => {
	expect(environmentBuild({ assetsBase: "/" }).client.assetsDir).toBe("assets");
	expect(() => environmentBuild({ assetsBase: "/", assetsDir: "static" })).toThrow("assets");
});

it("order", () => {
	expect(environmentOrder(true)).toEqual(["client", "ssr", "worker"]);
});

it("no worker", () => {
	expect(environmentOrder(false)).toEqual(["client", "ssr"]);
});

it("client url", () => {
	expect(clientUrl({ entry: "src/client.tsx" })).toBe("/src/client.tsx");
	const manifest = { "src/client.tsx": { file: "assets/client-1a2b3c.js" } };
	expect(clientUrl({ entry: "src/client.tsx", manifest })).toBe("/assets/client-1a2b3c.js");
	expect(() => clientUrl({ entry: "src/main.tsx", manifest })).toThrow(/src\/main\.tsx/);
});
