import { createContext, useContext } from "solid-js";
import type { Router } from "./create-router.ts";

export const RouterContext = createContext<Router>();

export function useRouter(): Router {
	try {
		return useContext(RouterContext);
	} catch (caught) {
		throw new Error("useRouter outside provider", { cause: caught });
	}
}
