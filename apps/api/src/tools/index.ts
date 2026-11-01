import { tool, zodSchema, type ToolSet } from 'ai';
import { readTools } from './read';
import { runTool, type AgentTool, type ToolContext } from './registry';
import { riskyTools } from './risky';
import { writeTools } from './write';

// Every v1 tool of §6.6 (`propose_plan` belongs to the proposal flow, LW-11).
export const TOOLS: AgentTool[] = [...readTools, ...writeTools, ...riskyTools];

export function toolByName(name: string): AgentTool | undefined {
  return TOOLS.find((entry) => entry.name === name);
}

// The AI SDK turns a bare zod schema into JSON Schema again in every model step; a `zodSchema`
// keeps its JSON Schema. Built once per isolate, at import (LW-15).
const INPUT_SCHEMAS = new Map(
  TOOLS.map((entry) => {
    const schema = zodSchema(entry.input);
    void schema.jsonSchema;
    return [entry.name, schema];
  }),
);

// The registry as AI SDK tools bound to one chat turn.
export function agentTools(ctx: ToolContext): ToolSet {
  return Object.fromEntries(
    TOOLS.map((entry) => [
      entry.name,
      tool({
        description: entry.description,
        inputSchema: INPUT_SCHEMAS.get(entry.name)!,
        execute: (input) => runTool(ctx, entry, input),
      }),
    ]),
  );
}
