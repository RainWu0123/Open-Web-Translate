# Contributing to Open Web Translate

Thank you for your interest in contributing to Open Web Translate!

## Development Workflow

1. Fork and clone the repository.
2. Ensure Node.js LTS and `pnpm` are installed.
3. Run `pnpm install`.
4. Create a feature branch: `git checkout -b feature/my-cool-feature`.
5. Run `pnpm typecheck` and `pnpm build:chrome` to verify your changes.
6. Submit a Pull Request.

## Code Standards

- All code must pass `pnpm typecheck` with strict mode enabled.
- Extension APIs must go through WXT's unified `browser` API or `@/infrastructure` abstractions.
- Vue UI components must **never** directly invoke extension APIs.
- Production logs must never expose sensitive user data, API keys, or text content.
