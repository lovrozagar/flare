import { Tabs as BaseTabs } from "@solidports/base-ui/tabs"
import { mergeClass } from "./utils/merge-class.ts"

export const Tabs = BaseTabs.Root

export type TabsListProps = BaseTabs.List.Props

export function TabsList(props: TabsListProps) {
  return (
    <BaseTabs.List
      {...props}
      class={mergeClass("inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-fg", props.class)}
    />
  )
}

export type TabsTriggerProps = BaseTabs.Tab.Props

export function TabsTrigger(props: TabsTriggerProps) {
  return (
    <BaseTabs.Tab
      {...props}
      class={mergeClass("inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring focus-visible:ring-ring disabled:pointer-events-none data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow", props.class)}
    />
  )
}

export type TabsContentProps = BaseTabs.Panel.Props

export function TabsContent(props: TabsContentProps) {
  return (
    <BaseTabs.Panel
      {...props}
      class={mergeClass("mt-2 focus-visible:outline-none focus-visible:ring focus-visible:ring-ring", props.class)}
    />
  )
}
