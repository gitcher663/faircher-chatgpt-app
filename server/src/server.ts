import { McpServer } from "@modelcontextprotocol/sdk/server";
import { registerFairCherTool } from "./tool";

const server = new McpServer({
  name: "faircher-mcp",
  version: "1.0.0",
});

registerFairCherTool(server);

server.start({
  port: Number(process.env.PORT) || 3000,
});
