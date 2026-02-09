---
name: security-checklist
description: Use this when performing security review of code, checking for OWASP vulnerabilities
---

## Use this when

- Performing a security-focused code review
- Checking code for OWASP Top 10 vulnerabilities
- Auditing authentication or authorization logic
- Reviewing code that handles user input or sensitive data
- Preparing for a security assessment

## OWASP Top 10 Code Review Checklist

### A01: Broken Access Control

- Authorization checks on every endpoint and action
- Server-side enforcement (not just client-side hiding)
- Deny by default; explicitly grant access
- CORS configuration is restrictive and intentional
- Directory listing is disabled
- JWT tokens are validated (signature, expiration, audience)
- No IDOR vulnerabilities (user can only access their own resources)

### A02: Cryptographic Failures

- Sensitive data encrypted at rest and in transit
- Strong algorithms used (AES-256, RSA-2048+, SHA-256+)
- No MD5 or SHA-1 for security purposes
- Keys are not hardcoded; stored in secure key management
- Passwords hashed with bcrypt, scrypt, or argon2 (with salt)
- TLS enforced for all external communication
- No sensitive data in URLs or query parameters

### A03: Injection

- SQL: parameterized queries or ORM, never string concatenation
- NoSQL: input validated before query construction
- OS Command: no shell execution with user input; use libraries
- LDAP: input escaped before LDAP queries
- XPath: parameterized queries
- Template: no user input in template expressions
- Log: user input sanitized before logging (log injection)

### A04: Insecure Design

- Threat modeling performed for new features
- Rate limiting on authentication and sensitive endpoints
- Business logic validated server-side
- Fail securely (deny access on error, not allow)
- Resource consumption limits in place

### A05: Security Misconfiguration

- Default credentials changed or removed
- Error messages do not expose stack traces or internals
- Security headers set (CSP, X-Frame-Options, HSTS)
- Unnecessary features and endpoints disabled
- Dependencies are up to date
- Debug mode disabled in production

### A06: Vulnerable and Outdated Components

- Dependencies checked for known vulnerabilities
- No abandoned or unmaintained libraries
- Components sourced from official repositories
- Dependency versions pinned to avoid supply chain attacks

### A07: Identification and Authentication Failures

- Multi-factor authentication available for sensitive operations
- No default or weak passwords allowed
- Account lockout after failed attempts (with backoff)
- Session tokens regenerated after login
- Sessions invalidated on logout
- Password complexity requirements enforced

### A08: Software and Data Integrity Failures

- CI/CD pipeline is secured
- Deserialization of untrusted data is avoided or validated
- Code and data integrity verified (checksums, signatures)
- Dependency integrity verified (lock files, checksums)

### A09: Security Logging and Monitoring Failures

- Authentication events are logged (success and failure)
- Authorization failures are logged
- Input validation failures are logged
- Logs do not contain sensitive data (passwords, tokens, PII)
- Log format supports automated analysis
- Alerting configured for suspicious patterns

### A10: Server-Side Request Forgery (SSRF)

- URL inputs validated against allowlist
- Internal network access blocked from user-supplied URLs
- Redirects not followed blindly
- Response data from fetched URLs is sanitized

## Quick checklist

- [ ] No hardcoded secrets, keys, or passwords
- [ ] User input validated and sanitized everywhere
- [ ] SQL/NoSQL queries are parameterized
- [ ] HTML output is escaped (XSS prevention)
- [ ] Authentication on all protected endpoints
- [ ] Authorization checked per-resource (no IDOR)
- [ ] Passwords hashed with strong algorithm and salt
- [ ] TLS enforced for external communication
- [ ] Error messages do not leak internals
- [ ] Dependencies are current and vulnerability-free
- [ ] Security events are logged
- [ ] Rate limiting on sensitive endpoints
