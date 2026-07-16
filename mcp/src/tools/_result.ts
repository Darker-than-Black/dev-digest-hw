import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';
import { ApiError } from '../http.js';

/** Wrap a JSON-serialisable payload as an MCP text result (compact — no pretty spaces). */
export function jsonResult(payload: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

/** Turn API/validation errors into an `isError` result instead of crashing the server. */
async function runGuarded(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    const message =
      err instanceof ApiError
        ? `${err.code}: ${err.message}`
        : String((err as Error)?.message ?? err);
    return { isError: true, content: [{ type: 'text', text: message }] };
  }
}

/**
 * Register a tool with a raw Zod shape.
 *
 * The shape is typed as `ZodRawShape` (not the narrow literal) on purpose: it keeps
 * `registerTool`'s generic inference shallow, sidestepping the TS2589
 * "excessively deep" blow-up that the MCP SDK + zod 3.25 generics otherwise trigger.
 * Runtime validation is unaffected — the real shape object is still passed to the SDK,
 * which validates args before the handler runs. Handlers receive the validated args as
 * `Record<string, unknown>` and narrow them with a local cast.
 */
export function defineTool(
  server: McpServer,
  name: string,
  meta: { title: string; description: string },
  inputSchema: ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>,
): void {
  // registerTool is called through a non-generic signature cast so TypeScript
  // does NOT instantiate its deep `ShapeOutput<Shape>` generic — that instantiation
  // is what triggers TS2589 ("excessively deep") under the MCP SDK + zod 3.25.
  // The real shape object is still passed, so runtime arg validation is unaffected.
  const register = server.registerTool.bind(server) as (
    name: string,
    config: { title: string; description: string; inputSchema: ZodRawShape },
    cb: (args: Record<string, unknown>) => Promise<CallToolResult>,
  ) => void;
  register(name, { ...meta, inputSchema }, (args) => runGuarded(() => handler(args)));
}
