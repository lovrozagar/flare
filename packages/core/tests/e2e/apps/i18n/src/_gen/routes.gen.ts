export const routeTree = [{ id: "[[locale]]/_root_/", path: "/[[locale]]/", module: () => import("../routes/[[locale]]/_root_/home.page.tsx").then((loaded) => loaded.route) }];
export const layouts = { "[[locale]]/_root_": () => import("../routes/[[locale]]/_root_/locale.root-layout.tsx").then((loaded) => loaded.route) };
export const chunks = { "[[locale]]/_root_/": "/src/routes/[[locale]]/_root_/home.page.tsx", "[[locale]]/_root_": "/src/routes/[[locale]]/_root_/locale.root-layout.tsx" };
