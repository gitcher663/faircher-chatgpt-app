import { createServer } from "http";
import { handleTool, toolDefinition } from "./tool";
import type { ToolInput } from "./types";

const port = Number(process.env.PORT ?? 8080);

const server = createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      const payload = JSON.parse(body) as ToolInput;
      const data = await handleTool(payload);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ tool: toolDefinition.name, data }));
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error"
        })
      );
    }
  });
});

server.listen(port, () => {
  console.log(`MCP server listening on :${port}`);
});
