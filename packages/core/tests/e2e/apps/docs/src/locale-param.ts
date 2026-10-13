import { useParams } from "@lovrozagar/flare";

// The `[[locale]]` param every main-root link carries. The default locale has no segment, so it is undefined.
export function useLocaleParam(): () => string | undefined {
	const params = useParams({ from: "[[locale]]/_root_" });
	return () => params.locale;
}
