import type {
  Message,
  PlanToolOutput,
  ProposalToolOutput,
  SyncRow,
  WriteToolOutput,
} from '@liftwise/core';

// The chat as shown (§5.9): stored messages from the mirror and the turn streaming now, as text
// and cards. Read tools and failed calls show nothing; the model's answer says what it found.

// A message as the AI SDK client has it: parts are text, tool calls and other kinds.
export type ChatMessage = { id: string; role: string; parts: Message['parts'] };

export type MessageItem =
  | { kind: 'text'; key: string; text: string }
  | { kind: 'change'; key: string; output: WriteToolOutput }
  | { kind: 'proposal'; key: string; output: ProposalToolOutput }
  | { kind: 'plan'; key: string; output: PlanToolOutput }
  // A tool still running; `planning` while the workout proposal is worked out, which takes longer.
  | { kind: 'working'; key: string; planning: boolean };

export type MessageView = {
  id: string;
  role: Message['role'];
  items: MessageItem[];
  // From the mirror: the server has it, so its proposals can be confirmed (D50).
  stored: boolean;
};

type Part = ChatMessage['parts'][number];

const isTool = (part: Part) => part.type.startsWith('tool-') || part.type === 'dynamic-tool';

function isWriteOutput(output: unknown): output is WriteToolOutput {
  return (
    typeof output === 'object' && output !== null && 'groupId' in output && 'changes' in output
  );
}

function isProposalOutput(output: unknown): output is ProposalToolOutput {
  return typeof output === 'object' && output !== null && 'proposalId' in output;
}

function isPlanOutput(output: unknown): output is PlanToolOutput {
  return isProposalOutput(output) && 'plan' in output;
}

function itemOf(part: Part, index: number): MessageItem | null {
  const key = typeof part.toolCallId === 'string' ? part.toolCallId : String(index);
  if (part.type === 'text') {
    const text = typeof part.text === 'string' ? part.text.trim() : '';
    return text ? { kind: 'text', key, text } : null;
  }
  if (!isTool(part)) return null;
  if (part.state === 'input-streaming' || part.state === 'input-available') {
    return { kind: 'working', key, planning: part.type === 'tool-propose_workout' };
  }
  if (part.state !== 'output-available') return null;
  if (isPlanOutput(part.output)) return { kind: 'plan', key, output: part.output };
  if (isProposalOutput(part.output)) return { kind: 'proposal', key, output: part.output };
  // A write that changed nothing has no card.
  if (isWriteOutput(part.output) && part.output.changes.length > 0) {
    return { kind: 'change', key, output: part.output };
  }
  return null;
}

export function messageView(message: ChatMessage, stored: boolean): MessageView {
  const items = message.parts.map(itemOf).filter((item): item is MessageItem => item !== null);
  return { id: message.id, role: message.role === 'user' ? 'user' : 'assistant', items, stored };
}

// Stored messages in the server's order (`created_at`, then id), then those of this session the
// mirror doesn't have yet. A stored copy wins: it has the outcome of confirmations.
export function chatView(stored: SyncRow<'messages'>[], live: ChatMessage[]): MessageView[] {
  const ordered = [...stored].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  const ids = new Set(ordered.map((message) => message.id));
  return [
    ...ordered.map((message) => messageView(message, true)),
    ...live.filter((message) => !ids.has(message.id)).map((message) => messageView(message, false)),
  ].filter((view) => view.items.length > 0);
}
