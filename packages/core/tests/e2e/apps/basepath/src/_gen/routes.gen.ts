export const routeTree = [{ id: "_root_/", path: "/", module: () => import("../routes/_root_/home.page.tsx") }];
export const layouts = { "_root_": () => import("../routes/_root_/root.root-layout.tsx") };
export const chunks = { "_root_/": "/src/routes/_root_/home.page.tsx", "_root_": "/src/routes/_root_/root.root-layout.tsx" };
