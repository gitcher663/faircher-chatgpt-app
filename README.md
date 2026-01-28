# faircher-chatgpt-app

FairCher ChatGPT app powered by an MCP server that summarizes advertising
activity for a given domain.

## Configuration

Set the following environment variables before running the server:

- `UPSTREAM_API_KEY`: SearchAPI key used to fetch ads data.
- `BUILTWITH_KEY`: BuiltWith API key for infrastructure signals.
- `PORT`: Optional server port (defaults to 3000).

## Development

Build the UI and server:

```bash
npm --prefix ui install
npm --prefix server install
npm --prefix ui run build
npm --prefix server run build
```

## Troubleshooting

- [GitHub conflicts and MCP reconnects](docs/troubleshooting-github.md)
