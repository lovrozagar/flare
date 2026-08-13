import { Form } from "flare-ui/form"
import { Input } from "flare-ui/input"
import { Button } from "flare-ui/button"
import { Label } from "flare-ui/label"

export default function FormRoute() {
  return (
    <Form class="w-full max-w-sm" onSubmit={(e) => e.preventDefault()}>
      <div class="space-y-1">
        <Label for="email">Email</Label>
        <Input id="email" type="email" placeholder="m@example.com" />
      </div>
      <div class="space-y-1">
        <Label for="password">Password</Label>
        <Input id="password" type="password" />
      </div>
      <Button type="submit">Sign in</Button>
    </Form>
  )
}
