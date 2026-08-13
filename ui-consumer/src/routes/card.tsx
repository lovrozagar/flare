import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "flare-ui/card"
import { Button } from "flare-ui/button"

export default function CardRoute() {
  return (
    <Card class="w-[350px]">
      <CardHeader>
        <CardTitle>Card title</CardTitle>
        <CardDescription>Card description here.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Card content goes here.</p>
      </CardContent>
      <CardFooter>
        <Button>Action</Button>
      </CardFooter>
    </Card>
  )
}
