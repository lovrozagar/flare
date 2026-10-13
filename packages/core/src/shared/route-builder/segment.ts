import type { JSX } from "@solidjs/web";

import type { CdnCache } from "./chain.ts";

// A segment stores nothing. Its `cdn` is a default for the pages under it (dx/cache.md).
export type SegmentCache = { cdn: CdnCache };

// `children` is optional as on any chain render, so a segment record is a route module (BUGS.md B22).
export type SegmentRender = (props: { children?: JSX.Element }) => JSX.Element;

// `_type` names the kind for the generated register, which keeps a segment out of `to` (dx/types.md).
export type SegmentRecord<Id extends string = string> = {
	readonly _type: "segment";
	id: Id;
	cache: SegmentCache;
	render: SegmentRender;
};

export type SegmentBuilder<Id extends string = string> = {
	id: Id;
	render: SegmentRender;
	cache: (config: SegmentCache) => SegmentRecord<Id>;
};

function render(props: { children?: JSX.Element }): JSX.Element {
	return props.children;
}

export function createPathSegment<Id extends string>(id: Id): SegmentBuilder<Id> {
	return {
		id,
		render,
		cache(config: SegmentCache): SegmentRecord<Id> {
			return { _type: "segment", id, cache: config, render };
		},
	};
}
