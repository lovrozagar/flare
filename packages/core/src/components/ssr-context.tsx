import { createContext, useContext } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { DirectionConfig } from "../direction.ts";
import type { LocaleConfig } from "../locale/index.tsx";
import type { HeadConfig } from "../route-builder/types.ts";
import type { ThemeConfig } from "../theme.ts";

export interface SSRContextValue {
	direction?: DirectionConfig;
	entryScript?: string;
	flareStateScript: string;
	isServer: boolean;
	locale?: LocaleConfig;
	nonce: string;
	resolvedHead?: HeadConfig;
	theme?: ThemeConfig;
}

const SSRCtx = createContext<SSRContextValue | null>(null);

/** @deprecated Wrap the tree with SSRContextProvider. Solid 2 has no sharedConfig.context. */
export function setSSRContext(_value: SSRContextValue): void {}

export function useSSRContext(): SSRContextValue | undefined {
	return useContext(SSRCtx) ?? undefined;
}

export function SSRContextProvider(props: { children: JSX.Element; value: SSRContextValue }): JSX.Element {
	return <SSRCtx value={props.value}>{props.children}</SSRCtx>;
}
