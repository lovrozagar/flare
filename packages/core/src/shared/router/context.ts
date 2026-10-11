import { createContext, useContext, type Context } from "solid-js";
import type { Router } from "./create-router.ts";

export const RouterContext: Context<Router> = createContext<Router>();

export function useRouter(): Router {
	try {
		return useContext(RouterContext);
	} catch (caught) {
		throw new Error("useRouter outside provider", { cause: caught });
	}
}
