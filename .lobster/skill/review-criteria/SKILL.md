---
name: review-criteria
description: Use this when reviewing code or setting up review criteria for the LOBSTER review loop
---

## Use this when

- Reviewing code in the LOBSTER review loop
- Setting up review standards for a project
- Evaluating pull requests or code changes
- Training new reviewers on what to look for

## Code Review Checklist

### Correctness

- Does the code implement the requirements correctly?
- Are all code paths reachable and tested?
- Are loop conditions and bounds correct?
- Are return values used and checked?
- Are comparisons correct (off-by-one, equality vs identity)?
- Are async operations awaited properly?

### Security

- No hardcoded secrets, API keys, or passwords
- User input is validated and sanitized before use
- SQL queries use parameterized statements
- HTML output is escaped to prevent XSS
- File paths are validated to prevent path traversal
- Authentication and authorization checks are in place
- Sensitive data is not logged or exposed in error messages

### Performance

- No unnecessary database queries inside loops (N+1)
- Large datasets are paginated or streamed
- Expensive computations are cached when appropriate
- No memory leaks (event listeners removed, subscriptions cleaned up)
- Indexes exist for frequently queried database columns
- No blocking operations on the main thread

### Error Handling

- Errors are caught at system boundaries (API endpoints, event handlers)
- Error messages are helpful without leaking internals
- Failed operations clean up resources (connections, file handles)
- Retry logic has backoff and maximum attempts
- Graceful degradation when external services fail

### Readability

- Function and variable names describe their purpose
- Functions do one thing and are under 30 lines where possible
- No deeply nested conditionals (prefer early returns)
- Comments explain "why" not "what"
- No dead code or commented-out blocks
- Consistent formatting and style

### Testing

- New code has corresponding tests
- Tests cover happy path, edge cases, and error cases
- Tests are independent and deterministic
- Test names describe the expected behavior
- Mocks and stubs are minimal and focused

### Architecture

- Changes follow existing patterns in the codebase
- No circular dependencies introduced
- Public API surface is minimal
- Configuration is externalized, not hardcoded
- Changes are backward compatible or migration is provided

## Quick checklist

- [ ] Code compiles and runs without errors
- [ ] All tests pass
- [ ] No hardcoded secrets
- [ ] User input is validated
- [ ] Errors are handled at boundaries
- [ ] No N+1 queries or obvious performance issues
- [ ] Names are clear and descriptive
- [ ] No dead code
- [ ] Changes are tested
