import express from "express";
import path from "path";

import { registerFairCherTool, type ToolRegistry } from "./tool";
import { registerFairCherLandingPageTool } from "./tool_landing_page";
import { registerFairCherSearchAdsTool } from "./tool_search_ads";
import { registerFairCherDisplayAdsTool } from "./tool_display_ads";
import { registerFairCherStreamingAdsTool } from "./tool_streaming_ads";

const app = express();
app.use(express.json({ limit: "1mb" }));

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

type RpcReply = {
  jsonrpc: "2.0";
  id: string | number | null | undefined;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

// -----------------------------
// Tool registry (MULTI-TOOL)
// -----------------------------
const tools: ToolRegistry = {
  ...registerFairCherTool(),               // domain-as-advertiser summary
  ...registerFairCherLandingPageTool(),    // landing-page attribution
  ...registerFairCherSearchAdsTool(),      // search ads (text ads)
  ...registerFairCherDisplayAdsTool(),     // display ads (image ads)
  ...registerFairCherStreamingAdsTool(),   // streaming ads (video ads)
};

// -----------------------------
// UI hosting (optional, safe)
// -----------------------------
const uiDistPath = path.join(__dirname, "../ui/dist");

app.use("/ui", express.static(uiDistPath));

app.get("/ui/faircher-ads-summary", (_req, res) => {
  res.sendFile(path.join(uiDistPath, "index.html"));
});

app.get("/ui/faircher/ads-summary.html", (_req, res) => {
  res.sendFile(path.join(uiDistPath, "index.html"));
});

// Root info
app.get("/", (_req, res) => {
  res
    .status(200)
    .send(
      "FairCher MCP server is running. Use JSON-RPC POST / or /mcp (initialize, tools/list, tools/call). SSE: GET /sse + POST /messages."
    );
});

// Health check
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

const jsonReplacer = (_key: string, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value;

function buildStrictToolDefinition(tool: ToolRegistry[string]["definition"]) {
  try {
    const inputSchema = tool?.inputSchema ?? {};
    const properties =
      typeof inputSchema?.properties === "object" && inputSchema?.properties
        ? inputSchema.properties
        : {};
    const safeProperties = JSON.parse(
      JSON.stringify(properties ?? {}, jsonReplacer)
    ) as Record<string, unknown>;
    const required = Array.isArray(inputSchema?.required)
      ? inputSchema.required.filter(
          (key: unknown) =>
            typeof key === "string" &&
            Object.prototype.hasOwnProperty.call(safeProperties, key)
        )
      : [];
    const name = typeof tool?.name === "string" ? tool.name.trim() : "";
    const description =
      typeof tool?.description === "string" ? tool.description.trim() : "";

    if (!name) {
      throw new Error("Tool definition is missing a valid name.");
    }

    return {
      name,
      description,
      input_schema: {
        type: "object",
        properties: safeProperties,
        required,
        additionalProperties: false,
      },
    };
  } catch (error) {
    console.error("MCP TOOL DEFINITION ERROR", {
      name: tool?.name,
      error,
      stack: error instanceof Error ? error.stack : error,
    });
    return null;
  }
}

// -----------------------------
// MCP-style JSON-RPC logic
// -----------------------------
function buildStrictToolDefinition(tool: ToolRegistry[string]["definition"]) {
  try {
    const inputSchema = tool?.inputSchema ?? {};
    const properties =
      typeof inputSchema?.properties === "object" && inputSchema?.properties
        ? inputSchema.properties
        : {};
    const required = Array.isArray(inputSchema?.required)
      ? inputSchema.required.filter((key: unknown) =>
          typeof key === "string" && Object.prototype.hasOwnProperty.call(properties, key)
        )
      : [];

    const schemaPayload = {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    };

  const reply = (result: unknown) => {
    if (isNotification) return res.status(204).end();
    return res.json({
      jsonrpc: "2.0",
      id,
      result,
    });
  };

  const rpcError = (code: number, message: string, data?: unknown) => {
    if (isNotification) return res.status(204).end();
    return res.json({
      jsonrpc: "2.0",
      id,
      error: { code, message, data },
    });
  };

  try {
    if (jsonrpc !== "2.0" || typeof method !== "string") {
      return rpcError(-32600, "Invalid Request");
    }

    // -----------------------------
    // MCP: initialize
    // -----------------------------
    if (method === "initialize") {
      const safeParams =
        typeof params === "object" && params !== null ? params : {};
      const clientInfo =
        typeof (safeParams as { clientInfo?: unknown }).clientInfo === "object" &&
        (safeParams as { clientInfo?: unknown }).clientInfo !== null
          ? (safeParams as { clientInfo?: Record<string, unknown> }).clientInfo
          : {};
      const clientProtocolVersion =
        typeof (safeParams as { protocolVersion?: string }).protocolVersion ===
        "string"
          ? (safeParams as { protocolVersion?: string }).protocolVersion
          : "2024-11-05";

      return reply({
        protocolVersion: clientProtocolVersion,
        serverInfo: { name: "faircher-mcp", version: "1.0.0" },
        clientInfo,
        capabilities: { tools: {} },
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
      const definitions = Object.values(tools)
        .map(tool => buildStrictToolDefinition(tool.definition))
        .filter(
          (definition): definition is NonNullable<typeof definition> =>
            definition !== null
        );

      if (definitions.length === 0) {
        console.error("MCP TOOL LIST ERROR: no valid tool definitions found.");
      }
      return reply({
        tools: definitions,
      });
    }

    // -----------------------------
    // MCP: tools/call
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

      // ✅ MCP-compliant: return CallToolResult directly
      return reply(toolResult);
    }

    return rpcError(-32601, `Method not found: ${method}`);
  } catch (e: any) {
    console.error("MCP SERVER ERROR", {
      method,
      params,
      error: e?.message ?? String(e),
      stack: e instanceof Error ? e.stack : e,
    });
    return rpcError(-32000, "Server error", {
      message: e?.message ?? String(e),
    });
  }
}

function isNotificationRequest(body: JsonRpcRequest) {
  return body?.id === undefined || body?.id === null;
}

// -----------------------------
// Streamable HTTP: JSON-RPC POST
// -----------------------------
async function handleJsonRpcHttp(req: express.Request, res: express.Response) {
  const body = req.body ?? {};
  const reply = await handleJsonRpc(body as JsonRpcRequest);
  if (isNotificationRequest(body)) {
    return res.status(204).end();
  }
  return res.status(200).json(reply);
}

app.post("/", handleJsonRpcHttp);
app.post("/mcp", handleJsonRpcHttp);

// -----------------------------
// SSE transport: GET /sse + POST /messages
// -----------------------------
const sseClients = new Set<express.Response>();

app.get("/sse", (req, res) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write("event: ready\ndata: {}\n\n");

  sseClients.add(res);

  req.on("close", () => {
    sseClients.delete(res);
  });
});

function publishSseMessage(payload: RpcReply) {
  const data = JSON.stringify(payload);
  for (const client of sseClients) {
    client.write(`event: message\ndata: ${data}\n\n`);
  }
}

async function handleSseMessage(req: express.Request, res: express.Response) {
  const body = req.body ?? {};
  const reply = await handleJsonRpc(body as JsonRpcRequest);

  if (sseClients.size > 0) {
    publishSseMessage(reply);
    return res.status(isNotificationRequest(body) ? 204 : 202).end();
  }

  if (isNotificationRequest(body)) {
    return res.status(204).end();
  }

  return res.status(200).json(reply);
}

app.post("/messages", handleSseMessage);
app.post("/message", handleSseMessage);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`faircher-mcp listening on :${port}`);
});
