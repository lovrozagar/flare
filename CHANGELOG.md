# Changelog

## 0.3.0

- `cn` resolves Tailwind conflicts. The last utility in a group wins.
- A static `class="px-2 px-4"` compiles to `px-4`. Dynamic class lists keep a runtime `cn` call.
- Runtime `cn` is tree-shaken unless a dynamic class list exists.
- Non-Tailwind tokens are not deduped. Hashed atomics and `group` / `peer` markers stay.
