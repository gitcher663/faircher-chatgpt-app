# MCP Tool Spec

## Tool name

`faircher_ads_summary`

## Input

```json
{
  "domain": "string"
}
```

## Output

The MCP server returns structured JSON matching the shared schema in
`server/src/types.ts` and `ui/src/types.ts`.

## TODO

- Define required/optional fields and validation rules.
- Document error responses and status codes.
