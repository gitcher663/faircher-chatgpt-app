import express from "express";
import path from "path";
import { registerFairCherTool, type ToolRegistry } from "./tool";

const app = express();
app.use(express.json({ limit: "1mb" }));

// -----------------------------
// Tool registry
// -----------------------------
const tools: ToolRegistry = registerFairCherTool();

// -----------------------------
// UI hosting (required for outputTemplate url)
// -----------------------------
const uiDistPath = path.join(__dirname, "../ui/dist");

app.use("/ui", express.static(uiDistPath));

app.get("/ui/faircher-ads-summary", (_req, res) => {
  res.sendFile(path.join(uiDistPath, "index.html"));
});

// Optional: root helpful response
app.get("/", (_req, res) => {
  res
    .status(200)
    .send(
      "FairCher MCP server is running. Use JSON-RPC POST / (initialize, tools/list, tools/call)."
    );
});

// Health endpoint
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

// -----------------------------
// MCP-style JSON-RPC endpoint
// -----------------------------
app.post("/", async (req, res) => {
  const body = req.body ?? {};
  const { jsonrpc, id, method, params } = body;

  const isNotification = id === undefined || id === null;

  function reply(result: unknown) {
    if (isNotification) return res.status(204).end();
    return res.json({
      jsonrpc: "2.0",
      id,
      result
    });
  }

  function rpcError(code: number, message: string, data?: unknown) {
    if (isNotification) return res.status(204).end();
    return res.json({
      jsonrpc: "2.0",
      id,
      error: { code, message, data }
    });
  }

  try {
    if (jsonrpc !== "2.0" || typeof method !== "string") {
      return rpcError(-32600, "Invalid Request");
    }

    // -----------------------------
    // MCP: initialize
    // -----------------------------
    if (method === "initialize") {
      const clientProtocolVersion =
        typeof params?.protocolVersion === "string"
          ? params.protocolVersion
          : "2024-11-05";

      return reply({
        protocolVersion: clientProtocolVersion,
        serverInfo: { name: "faircher-mcp", version: "1.0.0" },
        capabilities: { tools: {} }
      });
    }

    // MCP: notification after initialize
    if (method === "notifications/initialized") {
      return reply({ ok: true });
    }

    // -----------------------------
    // MCP: tools/list
    // -----------------------------
    if (method === "tools/list") {
      return reply({
        tools: Object.values(tools).map((t) => t.definition)
      });
    }

    // -----------------------------
    // MCP: tools/call  ✅ FIX IS HERE
    // -----------------------------
    if (method === "tools/call") {
      const name = params?.name;
      const args = params?.arguments;

      if (typeof name !== "string" || !name) {
        return rpcError(-32602, "Invalid params: missing tool name");
      }

      const tool = tools[name];
      if (!tool) {
        return rpcError(-32601, `Tool not found: ${name}`);
      }

      const toolResult = await tool.run(args ?? {});

      // 🔴 CRITICAL FIX:
      // Tool output MUST be wrapped in result.toolResult
      return reply({
        toolResult
      });
    }

    return rpcError(-32601, `Method not found: ${method}`);
  } catch (e: any) {
    return rpcError(-32000, "Server error", {
      message: e?.message ?? String(e)
    });
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`faircher-mcp listening on :${port}`);
});
