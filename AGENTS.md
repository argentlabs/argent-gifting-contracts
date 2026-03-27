# Agent Notes

## Cairo guidance

- Prefer `assert!` over `assert` in tests for better error messages

## TypeScript guidance

- Prefer left-hand side type declaration (`const x: Type = ...`) over `as Type` or `<Type>` casts
- When loading or deploying contracts, prefer typing the left-hand side of the assignment: `const contract: GiftFactoryContract = await manager.loadContract(...)`
- To skip fee estimation, provide explicit `resourceBounds`

## Domain knowledge

- **GiftFactory**: Creates gift escrows, manages upgrades
- **EscrowAccount**: Per-gift account holding funds
- **EscrowLibrary**: Shared claim/cancel/dust logic
- `__validate__` and `__execute__` can't be called directly; runtime blocks them
