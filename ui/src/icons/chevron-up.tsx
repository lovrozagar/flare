import type { IconProps } from "./types.ts"

export function ChevronUp(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" {...props}>
      <path d="m18 15-6-6-6 6" />
    </svg>
  )
}
