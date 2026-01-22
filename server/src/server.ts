import express from "express";
import path from "path";

import { registerFairCherTool, type ToolRegistry } from "./tool";
import { registerFairCherLandingPageTool } from "./tool_landing_page";
import { registerFairCherSearchAdsTool } from "./tool_search_ads";
import { registerFairCherDisplayAdsTool } from "./tool_display_ads";
import { registerFairCherStreamingAdsTool } from "./tool_streaming_ads";

const app = express();
app.use(express.json({ limit: "1mb" }));

/* ======================================================================
   Types
   ====================================================================== */

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, any>;
};

type RpcReply = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

/* ======================================================================
   Tool registry
   ====================================================================== */

const tools: ToolRegistry = {
  ...registerFairCherTool(),
  ...registerFairCherLandingPageTool(),
  ...registerFairCherSearchAdsTool(),
  ...registerFairCherDisplayAdsTool(),
  ...registerFairCherStreamingAdsTool(),
};

/* ======================================================================
   UI hosting
   ====================================================================== */

const uiDistPath = path.join(__dirname, "../ui/dist");

app.use("/ui", express.static(uiDistPath));

app.get("/ui/faircher-ads-summary", (_req, res) =>
  res.sendFile(path.join(uiDistPath, "index.html"))
);

app.get("/ui/faircher/ads-summary.html", (_req, res) =>
  res.sendFile(path.join(uiDistPath, "index.html"))
);

/* ======================================================================
   Root + health
   ====================================================================== */

app.get("/", (_req, res) => {
  res.status(200).send(
    "FairCher MCP server is running. Use JSON-RPC POST / or /mcp. SSE: GET /sse."
  );
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

/* ======================================================================
   MCP discovery (STRICT, SCAN-SAFE)
   ====================================================================== */

app.get("/.well-known/mcp.json", (_req, res) => {
  res.json({
    protocolVersion: "2024-11-05",
    serverInfo: {
      name: "faircher-mcp",
      version: "1.0.0"
    },
    transport: {
      type: "sse",
      endpoint: "/sse"
    }
  });
});

/* ======================================================================
   Helpers
   ====================================================================== */

function isNotification(body: JsonRpcRequest) {
  return body.id === undefined || body.id === null;
}

/* ======================================================================
   Core JSON-RPC handler (SCAN-SAFE)
   ====================================================================== */

async function handleJsonRpc(body: JsonRpcRequest): Promise<RpcReply> {
  const { jsonrpc, id = null, method, params } = body;

  const reply = (result: unknown): RpcReply => ({
    jsonrpc: "2.0",
    id,
    result
  });

  const rpcError = (
    code: number,
    message: string,
    data?: unknown
  ): RpcReply => ({
    jsonrpc: "2.0",
    id,
    error: { code, message, data }
  });

  try {
    if (jsonrpc !== "2.0" || typeof method !== "string") {
      return rpcError(-32600, "Invalid Request");
    }

    /* --------------------------------------------------------------
       MCP initialize — STRICT & MINIMAL
       -------------------------------------------------------------- */
    if (method === "initialize") {
      const minimalTools: Record<string, unknown> = {};

      for (const tool of Object.values(tools)) {
        minimalTools[tool.definition.name] = {
          name: tool.definition.name,
          description: tool.definition.description,
          input_schema: tool.definition.inputSchema
        };
      }

      return reply({
        protocolVersion: "2024-11-05",
        serverInfo: {
          name: "faircher-mcp",
          version: "1.0.0"
        },
        capabilities: {
          tools: minimalTools
        }
      });
    }

    if (method === "notifications/initialized") {
      return reply({ ok: true });
    }

    /* --------------------------------------------------------------
       MCP tools/list — MATCHES initialize EXACTLY
       -------------------------------------------------------------- */
    if (method === "tools/list") {
      const list = Object.values(tools).map(t => ({
        name: t.definition.name,
        description: t.definition.description,
        input_schema: t.definition.inputSchema
      }));

      return reply({ tools: list });
    }

    /* --------------------------------------------------------------
       MCP tools/call — FULL RUNTIME BEHAVIOR
       -------------------------------------------------------------- */
    if (method === "tools/call") {
      const name = params?.name;
      const args = params?.arguments ?? {};

      if (typeof name !== "string") {
        return rpcError(-32602, "Missing tool name");
      }

      const tool = tools[name];
      if (!tool) {
        return rpcError(-32601, `Tool not found: ${name}`);
      }

      const result = await tool.run(args);
      return reply(result);
    }

    return rpcError(-32601, `Method not found: ${method}`);
  } catch (err: any) {
    return rpcError(-32000, "Server error", {
      message: err?.message ?? String(err)
    });
  }
}

/* ======================================================================
   HTTP JSON-RPC
   ====================================================================== */

app.post("/", async (req, res) => {
  const reply = await handleJsonRpc(req.body ?? {});
  if (isNotification(req.body ?? {})) return res.status(204).end();
  res.status(200).json(reply);
});

app.post("/mcp", async (req, res) => {
  const reply = await handleJsonRpc(req.body ?? {});
  if (isNotification(req.body ?? {})) return res.status(204).end();
  res.status(200).json(reply);
});

/* ======================================================================
   SSE transport
   ====================================================================== */

const sseClients = new Set<express.Response>();

app.get("/sse", (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  res.write("event: ready\ndata: {}\n\n");
  sseClients.add(res);

  res.on("close", () => {
    sseClients.delete(res);
  });
});

function publishSseMessage(payload: RpcReply) {
  const data = JSON.stringify(payload);
  for (const client of sseClients) {
    client.write(`event: message\ndata: ${data}\n\n`);
  }
}

app.post("/messages", async (req, res) => {
  const reply = await handleJsonRpc(req.body ?? {});
  if (sseClients.size > 0) publishSseMessage(reply);
  if (isNotification(req.body ?? {})) return res.status(204).end();
  res.status(202).end();
});

/* ======================================================================
   Start server
   ====================================================================== */

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`faircher-mcp listening on :${port}`);
});
