# Security Policy

## Supported versions

We release security updates for the latest minor version. Older versions may receive critical fixes at our discretion.

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via one of these channels:

1. **GitHub Security Advisories** (preferred): go to https://github.com/Quavon-dev/uptime-pocket/security/advisories/new
2. **Email**: opens a security advisory and we can communicate privately

You should receive a response within 48 hours. If for some reason you don't, please follow up via a public issue (without disclosing the vulnerability).

## What to include

Please include the following information:

- Type of issue (e.g. buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

## Our commitment

- We will acknowledge your report within 48 hours
- We will provide an initial assessment within 7 days
- We will keep you informed of our progress
- We will credit you in the fix (unless you prefer to remain anonymous)

## Scope

The following are in scope for security reports:

- The mobile app (`app/`, `src/`)
- The push relay service (`relay/`)
- Our build / release pipeline (when it exists)
- Anything that could compromise user data or the security of the Kuma servers we connect to

## Out of scope

- Issues in dependencies (please report to the upstream project)
- Theoretical issues without a proof of concept
- Issues that require a rooted/jailbroken device
- Social engineering attacks

## Recognition

We maintain a [Security Hall of Fame](https://github.com/Quavon-dev/uptime-pocket/security/advisories) of all reporters (with their permission).

Thank you for helping keep Uptime Pocket and its users safe. 🛡️
