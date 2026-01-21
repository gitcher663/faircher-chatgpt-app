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
// Build outputs to: server/ui/dist
// Serves at: /ui/*
// -----------------------------
const uiDistPath = path.join(__dirname, "../ui/dist");

// Serve static assets (JS/CSS)
app.use("/ui", express.static(uiDistPath));

// Serve the widget entry route declared by outputTemplate.url
app.get("/ui/faircher-ads-summary", (_req, res) => {
  res.sendFile(path.join(uiDistPath, "index.html"));
});

// Optional: root helpful response (browser clicks)
app.get("/", (_req, res) => {
  res.status(200).send(
    "FairCher MCP server is running. Use JSON-RPC POST / (initialize, tools/list, tools/call)."
  );
});

// Health endpoint
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

// -----------------------------
// Minimal MCP-style JSON-RPC endpoint
// -----------------------------
app.post("/", async (req, res) => {
  const body = req.body ?? {};
  const jsonrpc = body.jsonrpc;
  const id = body.id;
  const method = body.method;
  const params = body.params;

  const isNotification = id === undefined || id === null;

  function reply(result: unknown) {
    if (isNotification) return res.status(204).end();
    return res.json({ jsonrpc: "2.0", id, result });
  }

  function rpcError(code: number, message: string, data?: unknown) {
    if (isNotification) return res.status(204).end();
    return res.json({ jsonrpc: "2.0", id, error: { code, message, data } });
  }

  try {
    if (jsonrpc !== "2.0" || typeof method !== "string") {
      return rpcError(-32600, "Invalid Request");
    }

    // MCP: initialize
    if (method === "initialize") {
      // Per MCP expectations, include protocolVersion + capabilities
      const clientProtocolVersion =
        typeof params?.protocolVersion === "string"
          ? params.protocolVersion
          : "2024-11-05";

      return reply({
        protocolVersion: clientProtocolVersion,
        serverInfo: { name: "faircher-mcp", version: "1.0.0" },
        capabilities: { tools: {} },
      });
    }

    // MCP: notification after initialize (no response expected)
    if (method === "notifications/initialized") {
      return reply({ ok: true });
    }

    // MCP: tools/list
    if (method === "tools/list") {
      return reply({
        tools: Object.values(tools).map((t) => t.definition),
      });
    }

    // MCP: tools/call
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

      const result = await tool.run(args ?? {});
      return reply(result);
    }

    return rpcError(-32601, `Method not found: ${method}`);
  } catch (e: any) {
    return rpcError(-32000, "Server error", {
      message: e?.message ?? String(e),
    });
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`faircher-mcp listening on :${port}`);
});
