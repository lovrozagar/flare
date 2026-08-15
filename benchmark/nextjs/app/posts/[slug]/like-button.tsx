"use client";

import { useState } from "react";

export function LikeButton(props: { initial: number }) {
	const [count, setCount] = useState(props.initial);
	return (
		<button data-testid="like-button" onClick={() => setCount((c) => c + 1)} type="button">
			Like ({count})
		</button>
	);
}
