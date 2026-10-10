import type { CacheConfig } from "./types.ts";
import { BUILDER_MARKER } from "./types.ts";

export interface PathSegmentResult<TPath extends string> {
	_type: "layout";
	cache?: CacheConfig<TPath>;
	render: (props: { children: unknown }) => unknown;
	virtualPath: TPath;
	[BUILDER_MARKER]: true;
}

interface PathSegmentBuilderInitial<TPath extends string> {
	_type: "layout";
	cache(config: CacheConfig<TPath>): PathSegmentResult<TPath>;
	render: (props: { children: unknown }) => unknown;
	virtualPath: TPath;
	[BUILDER_MARKER]: true;
}

export function createPathSegment<TPath extends string>(virtualPath: TPath): PathSegmentBuilderInitial<TPath> {
	const transparentRender = (props: { children: unknown }) => props.children;
	const base: PathSegmentResult<TPath> = {
		_type: "layout",
		render: transparentRender,
		virtualPath,
		[BUILDER_MARKER]: true,
	};
	return {
		...base,
		cache(config) {
			return { ...base, cache: config };
		},
	};
}
