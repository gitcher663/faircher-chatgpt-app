# Architecture

This repository contains two primary packages:

- `server/`: MCP server implementation and static UI hosting.
- `ui/`: Vite + React UI bundle.

## High-level flow

1. The MCP server receives a domain lookup request.
2. The server normalizes the domain, calls the upstream API, and transforms data.
3. The server responds with structured JSON (no HTML).
4. The UI is built separately and served as static assets via `server/ui/dist`.

## Configuration & runtime dependencies

Environment variables (required for production):

- `UPSTREAM_API_KEY`: SearchAPI key used to fetch ads data.
- `BUILTWITH_KEY`: BuiltWith API key for infrastructure signals.
- `PORT`: Optional server port (defaults to 3000).

Runtime dependencies:

- Node.js 20+ (for native `fetch` and `AbortController`).

## TODO

- Add a sequence diagram once the upstream client is finalized.
