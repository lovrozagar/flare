import { createEffect, type JSX, onCleanup, useContext } from "solid-js"
import { isServer } from "solid-js/web"
import { RouterContext } from "../outlet/index.tsx"

export interface NavigationProgressProps {
	color?: string
	height?: number
	minDisplayTime?: number
	showPeg?: boolean
	speed?: number
	trickleSpeed?: number
	zIndex?: number
}

function clamp(n: number, min: number, max: number): number {
	if (n < min) return min
	if (n > max) return max
	return n
}

/**
 * nprogress-style increment curve.
 * Slows dramatically as it approaches 1 to feel realistic.
 */
function trickleIncrement(current: number): number {
	if (current < 0.2) return 0.1
	if (current < 0.5) return 0.04
	if (current < 0.8) return 0.02
	if (current < 0.99) return 0.005
	return 0
}

/**
 * Convert 0..1 progress to translate3d percentage (-100%..0%).
 * GPU-composited — no layout/paint, just composite.
 */
function toBarPerc(n: number): number {
	return (-1 + n) * 100
}

function toTranslate(n: number): string {
	return `translate3d(${toBarPerc(n)}%,0,0)`
}

export function NavigationProgress(props: NavigationProgressProps): JSX.Element {
	let wrapperRef: HTMLDivElement | undefined
	let barRef: HTMLDivElement | undefined
	let pegRef: HTMLDivElement | undefined

	const speed = (): number => props.speed ?? 200
	const trickleSpeed = (): number => props.trickleSpeed ?? 200
	const showPeg = (): boolean => props.showPeg !== false

	let status: number | null = null
	let trickleTimer: ReturnType<typeof setTimeout> | undefined
	let fadeTimer: ReturnType<typeof setTimeout> | undefined
	let minDisplayTimer: ReturnType<typeof setTimeout> | undefined
	let startTime = 0
	let pendingComplete = false

	function clearTimers(): void {
		if (trickleTimer !== undefined) {
			clearTimeout(trickleTimer)
			trickleTimer = undefined
		}
		if (fadeTimer !== undefined) {
			clearTimeout(fadeTimer)
			fadeTimer = undefined
		}
		if (minDisplayTimer !== undefined) {
			clearTimeout(minDisplayTimer)
			minDisplayTimer = undefined
		}
	}

	function set(value: number): void {
		const started = status !== null
		const n = clamp(value, 0.08, 1)
		status = n === 1 ? null : n

		if (!barRef || !wrapperRef) return

		/* Force reflow before transition on first render */
		if (!started) void wrapperRef.offsetWidth

		barRef.style.transition = `all ${speed()}ms linear`
		barRef.style.transform = toTranslate(n)
		barRef.setAttribute("aria-valuenow", String(Math.round(n * 100)))

		if (pegRef) {
			pegRef.style.display = showPeg() ? "block" : "none"
		}

		if (n === 1) {
			/*
			 * nprogress completion sequence:
			 * 1. Snap wrapper to opacity 1, no transition
			 * 2. Reflow
			 * 3. After speed ms: fade wrapper to opacity 0
			 * 4. After speed ms: reset bar position
			 */
			wrapperRef.style.transition = "none"
			wrapperRef.style.opacity = "1"
			void wrapperRef.offsetWidth

			fadeTimer = setTimeout(() => {
				if (!wrapperRef || !barRef) return
				wrapperRef.style.transition = `all ${speed()}ms linear`
				wrapperRef.style.opacity = "0"
				fadeTimer = setTimeout(() => {
					if (!wrapperRef || !barRef) return
					barRef.style.transition = "none"
					barRef.style.transform = toTranslate(0)
					wrapperRef.style.transition = "none"
					wrapperRef.style.opacity = "1"
				}, speed())
			}, speed())
		} else {
			wrapperRef.style.opacity = "1"
		}
	}

	function inc(amount?: number): void {
		const n = status
		if (n === null) {
			start()
			return
		}
		if (n > 1) return

		const increment = amount ?? trickleIncrement(n)
		set(clamp(n + increment, 0, 0.994))
	}

	function start(): void {
		if (status === null) set(0)
		startTime = Date.now()
		pendingComplete = false

		function work(): void {
			trickleTimer = setTimeout(() => {
				if (status === null) return
				inc()
				work()
			}, trickleSpeed())
		}
		work()
	}

	function done(): void {
		/* nprogress-style: burst forward with random increment before completing */
		inc(0.3 + 0.5 * Math.random())
		set(1)
	}

	function completeBar(): void {
		clearTimers()
		pendingComplete = false
		done()
	}

	function handleComplete(): void {
		const minTime = props.minDisplayTime ?? 0
		const elapsed = Date.now() - startTime

		if (elapsed < minTime) {
			pendingComplete = true
			minDisplayTimer = setTimeout(() => {
				if (pendingComplete) {
					completeBar()
				}
			}, minTime - elapsed)
		} else {
			completeBar()
		}
	}

	/* SSR: effects are no-ops. Client: RouterContext available via full-document hydration. */
	const ctx = useContext(RouterContext)

	if (!isServer && ctx) {
		createEffect(() => {
			const phase = ctx.navigationPhase()

			if (phase === "loading") {
				clearTimers()
				start()
			} else if (phase === "idle" && status !== null) {
				handleComplete()
			} else if (phase === "transitioning" && status !== null) {
				handleComplete()
			}
		})

		onCleanup(clearTimers)
	}

	const barColor = (): string => props.color ?? "currentColor"

	return (
		<div
			ref={wrapperRef}
			style={{
				height: `${props.height ?? 2}px`,
				left: "0",
				"pointer-events": "none",
				position: "fixed",
				top: "0",
				width: "100%",
				"z-index": props.zIndex ?? 9999,
			}}
		>
			<div
				aria-label="Page load progress"
				aria-valuemax="100"
				aria-valuemin="0"
				aria-valuenow={0}
				ref={barRef}
				role="progressbar"
				style={{
					"background-color": barColor(),
					height: "100%",
					left: "0",
					position: "absolute",
					top: "0",
					transform: toTranslate(0),
					transition: "all 0 linear",
					width: "100%",
				}}
			>
				<div
					ref={pegRef}
					style={{
						"box-shadow": `0 0 10px ${barColor()}, 0 0 5px ${barColor()}`,
						display: showPeg() ? "block" : "none",
						height: "100%",
						opacity: "1",
						position: "absolute",
						right: "0",
						transform: "rotate(3deg) translate(0px, -4px)",
						width: "100px",
					}}
				/>
			</div>
		</div>
	) as JSX.Element
}
