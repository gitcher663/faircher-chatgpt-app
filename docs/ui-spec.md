# UI Spec — FairCher Ads Summary

## Purpose

The UI is a standalone Vite + React application rendered inside ChatGPT.
It is responsible **only for presentation**, not data fetching or business logic.

All authoritative data is provided by the MCP server.

---

## Data Source (Authoritative)

The UI MUST consume data exclusively from:

```ts
window.openai.toolOutput
