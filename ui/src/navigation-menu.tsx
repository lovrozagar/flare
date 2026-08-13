import { NavigationMenu as BaseNavMenu } from "@solidports/base-ui/navigation-menu"
import type { JSX } from "solid-js"
import { mergeClass } from "./utils/merge-class.ts"
import { cn } from "./utils/cn.ts"
import { ChevronDown } from "./icons/chevron-down.tsx"

export const NavigationMenu = BaseNavMenu.Root
export const NavigationMenuList = BaseNavMenu.List
export const NavigationMenuItem = BaseNavMenu.Item
export const NavigationMenuLink = BaseNavMenu.Link
export const NavigationMenuPortal = BaseNavMenu.Portal
export const NavigationMenuViewport = BaseNavMenu.Viewport

export type NavigationMenuTriggerProps = BaseNavMenu.Trigger.Props

export function NavigationMenuTrigger(props: NavigationMenuTriggerProps) {
  return (
    <BaseNavMenu.Trigger
      {...props}
      class={mergeClass("group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-fg focus:bg-accent focus:text-accent-fg focus:outline-none disabled:pointer-events-none disabled:opacity-50 data-[popup-open]:bg-accent/50", props.class)}
    >
      {props.children}
      <ChevronDown class="relative top-[1px] ml-1 size-3 transition duration-200 group-data-[popup-open]:rotate-180" />
    </BaseNavMenu.Trigger>
  )
}

export type NavigationMenuContentProps = BaseNavMenu.Popup.Props

export function NavigationMenuContent(props: NavigationMenuContentProps) {
  return (
    <BaseNavMenu.Portal>
      <BaseNavMenu.Positioner>
        <BaseNavMenu.Popup
          {...props}
          class={mergeClass("left-0 top-0 w-full transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 md:absolute md:w-auto", props.class)}
        />
      </BaseNavMenu.Positioner>
    </BaseNavMenu.Portal>
  )
}

export type NavigationMenuIndicatorProps = JSX.HTMLAttributes<HTMLDivElement>

export function NavigationMenuIndicator(props: NavigationMenuIndicatorProps) {
  return (
    <div
      {...props}
      class={cn(
        "top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden",
        props.class,
      )}
    >
      <div class="bg-border relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm shadow-md" />
    </div>
  )
}
