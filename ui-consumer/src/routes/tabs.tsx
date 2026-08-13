import { Tabs, TabsContent, TabsList, TabsTrigger } from "flare-ui/tabs"

export default function TabsRoute() {
  return (
    <div class="p-8">
      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
        </TabsList>
        <TabsContent value="account"><p class="py-4 text-sm">Account settings.</p></TabsContent>
        <TabsContent value="password"><p class="py-4 text-sm">Password settings.</p></TabsContent>
      </Tabs>
    </div>
  )
}
