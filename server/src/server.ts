import express from "express";
import { registerFairCherTool, type ToolRegistry } from "./tool";

const app = express();
app.use(express.json({ limit: "1mb" }));

const tools: ToolRegistry = registerFairCherTool();

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

/**
 * Minimal MCP-style JSON-RPC endpoint.
 * ChatGPT/host will POST JSON-RPC requests here.
 */
app.post("/", async (req, res) => {
  const { jsonrpc, id, method, params } = req.body ?? {};

  function reply(result: unknown) {
    res.json({ jsonrpc: "2.0", id, result });
  }

  function error(code: number, message: string, data?: unknown) {
    res.json({ jsonrpc: "2.0", id, error: { code, message, data } });
  }

  try {
    if (jsonrpc !== "2.0" || typeof method !== "string") {
      return error(-32600, "Invalid Request");
    }

    // 1) initialize
    if (method === "initialize") {
      return reply({
        serverInfo: { name: "faircher-mcp", version: "1.0.0" },
        capabilities: { tools: {} }
      });
    }

    // 2) tools/list
    if (method === "tools/list") {
      return reply({
        tools: Object.values(tools).map((t) => t.definition)
      });
    }

    // 3) tools/call
    if (method === "tools/call") {
      const name = params?.name;
      const args = params?.arguments;

      if (typeof name !== "string") {
        return error(-32602, "Invalid params: missing tool name");
      }

      const tool = tools[name];
      if (!tool) {
        return error(-32601, `Tool not found: ${name}`);
      }

      const result = await tool.run(args ?? {});
      return reply(result);
    }

    return error(-32601, `Method not found: ${method}`);
  } catch (e: any) {
    return error(-32000, "Server error", { message: e?.message ?? String(e) });
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`faircher-mcp listening on :${port}`);
});
