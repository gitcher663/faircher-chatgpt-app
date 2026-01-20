# Architecture

This repository contains two primary packages:

- `server/`: MCP server implementation and static UI hosting.
- `ui/`: Vite + React UI bundle.

## High-level flow

1. The MCP server receives a domain lookup request.
2. The server normalizes the domain, calls the upstream API, and transforms data.
3. The server responds with structured JSON (no HTML).
4. The UI is built separately and served as static assets via `server/ui/dist`.

## TODO

- Document runtime dependencies for the MCP server.
- Add a sequence diagram once the upstream client is finalized.
