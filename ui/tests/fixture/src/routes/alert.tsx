import { Alert, AlertTitle, AlertDescription } from "flare-ui/alert"

export default function AlertRoute() {
  return (
    <div class="space-y-4">
      <Alert>
        <AlertTitle>Info</AlertTitle>
        <AlertDescription>This is a default alert.</AlertDescription>
      </Alert>
      <Alert data-variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Something went wrong.</AlertDescription>
      </Alert>
    </div>
  )
}
