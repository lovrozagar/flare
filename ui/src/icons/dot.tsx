import type { IconProps } from "./types.ts"

export function Dot(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="4" />
    </svg>
  )
}
