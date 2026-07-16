import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', 'src/server.ts'],
  env: { ...process.env, DEVDIGEST_API_URL: 'http://localhost:3001' },
});
const client = new Client({ name: 'smoke', version: '0.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`tools (${tools.length}):`);
for (const t of tools) {
  const keys = Object.keys((t.inputSchema as { properties?: object }).properties ?? {});
  console.log(`  - ${t.name}(${keys.join(', ')}) — ${t.description}`);
}

// Call a tool with an unknown repo — proves invocation + the actionable-error
// path (no backend needed; resolve fails fast with next-step guidance).
const blast = await client.callTool({
  name: 'get_blast_radius',
  arguments: { repo: 'demo/none', changedFiles: ['a.ts'] },
});
console.log('get_blast_radius →', JSON.stringify(blast.content), 'isError:', blast.isError);

await client.close();
