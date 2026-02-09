---
name: testing-patterns
description: Use this when writing tests, setting up test infrastructure, or deciding on testing strategies for the LOBSTER tester agent
---

## Use this when

- Writing tests for new or existing code
- Deciding what to test and how
- Setting up the tester agent's review criteria
- Reviewing test quality

## Testing Pyramid

### Unit Tests (Most)
- Test individual functions and methods
- Fast, isolated, no external dependencies
- One assertion per concept
- Cover: happy path, edge cases, error cases

### Integration Tests (Some)
- Test component interactions
- Database queries, API calls, middleware chains
- Use test databases or in-memory alternatives
- Verify data flows correctly between components

### End-to-End Tests (Few)
- Test complete user workflows
- Only for critical paths (login, checkout, signup)
- Slower and more brittle; keep count low

## Best Practices

### Naming
```
describe("functionName", () => {
  it("returns expected value when given valid input", () => {})
  it("throws when input is missing", () => {})
  it("handles empty array gracefully", () => {})
})
```

### Structure (Arrange-Act-Assert)
```typescript
// Arrange: set up test data
const input = { name: "test", value: 42 }

// Act: call the function
const result = process(input)

// Assert: verify the outcome
expect(result.status).toBe("success")
```

### What to Test
- Return values for different inputs
- Side effects (database writes, API calls)
- Error conditions and edge cases
- Boundary values (0, -1, MAX_INT, empty string, null)
- State transitions

### What NOT to Test
- Implementation details (private methods, internal state)
- Framework code (React rendering, Express routing)
- Simple getters/setters with no logic
- Third-party library behavior

## Edge Cases Checklist

- Null / undefined inputs
- Empty strings and arrays
- Very large inputs
- Unicode and special characters
- Concurrent access
- Network timeouts
- Disk full / permission denied
- Invalid date formats
- Negative numbers where positive expected
- Boundary values (0, 1, max-1, max)

## Quick checklist

- [ ] Tests cover happy path
- [ ] Tests cover error cases
- [ ] Tests cover edge cases (empty, null, boundary)
- [ ] Each test is independent
- [ ] Test names describe expected behavior
- [ ] No testing of implementation details
- [ ] Mocks are minimal and focused
- [ ] Tests run fast (under 5 seconds for unit tests)
