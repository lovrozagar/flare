import { Autocomplete, AutocompleteInput, AutocompleteContent, AutocompleteItem, AutocompleteEmpty } from "flare-ui/autocomplete"

const options = ["React", "Solid", "Vue", "Svelte", "Angular"]

export default function AutocompleteRoute() {
  return (
    <Autocomplete>
      <AutocompleteInput placeholder="Search framework..." />
      <AutocompleteContent>
        {options.map((opt) => (
          <AutocompleteItem key={opt} value={opt}>{opt}</AutocompleteItem>
        ))}
        <AutocompleteEmpty>No results.</AutocompleteEmpty>
      </AutocompleteContent>
    </Autocomplete>
  )
}
