# Security Policy

## Security Model

Open Web Translate follows a strict **Local-first** security model:
- API keys and tokens are stored exclusively in local extension storage.
- Translation content is never transmitted to third-party servers unless requested by the user to an explicit provider endpoint.
- Production logging redacts API keys and long text payloads.

## Reporting a Vulnerability

If you discover a potential security vulnerability, please report it privately via GitHub Security Advisories or email the maintainers. Do not open public issues for unpatched vulnerabilities.
