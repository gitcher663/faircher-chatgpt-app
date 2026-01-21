import { Server } from "@modelcontextprotocol/sdk/server";
import { registerFairCherTool } from "./tool.js";

const server = new Server({
  name: "faircher-mcp",
  version: "1.0.0",
});

registerFairCherTool(server);

server.start({
  port: Number(process.env.PORT) || 3000,
});
