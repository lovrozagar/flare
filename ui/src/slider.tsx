import { Slider as BaseSlider } from "@solidports/base-ui/slider"
import { mergeClass } from "./utils/merge-class.ts"

export type SliderProps = BaseSlider.Root.Props

export function Slider(props: SliderProps) {
  return (
    <BaseSlider.Root
      {...props}
      class={mergeClass("relative flex w-full touch-none select-none items-center", props.class)}
    >
      <SliderTrack>
        <SliderRange />
      </SliderTrack>
      <SliderThumb />
    </BaseSlider.Root>
  )
}

export type SliderTrackProps = BaseSlider.Control.Props

export function SliderTrack(props: SliderTrackProps) {
  return (
    <BaseSlider.Control
      {...props}
      class={mergeClass("relative h-2 w-full grow overflow-hidden rounded-full bg-secondary", props.class)}
    >
      <BaseSlider.Track>
        {props.children}
      </BaseSlider.Track>
    </BaseSlider.Control>
  )
}

export type SliderRangeProps = BaseSlider.Indicator.Props

export function SliderRange(props: SliderRangeProps) {
  return (
    <BaseSlider.Indicator
      {...props}
      class={mergeClass("absolute h-full bg-primary", props.class)}
    />
  )
}

export type SliderThumbProps = BaseSlider.Thumb.Props

export function SliderThumb(props: SliderThumbProps) {
  return (
    <BaseSlider.Thumb
      {...props}
      class={mergeClass("block size-5 rounded-full border-2 border-primary bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50", props.class)}
    />
  )
}
