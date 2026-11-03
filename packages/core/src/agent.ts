import type { WorkoutPlan } from './plan';
import type { ModelSettings, Provider } from './schemas/settings';
import type { SyncEntity } from './sync';

// Agent protocol (§5.9, §6.5–§6.7): what tools return to the chat cards, and provider status.

// One record a change card lists: its domain fields before and after (null when it didn't or
// doesn't exist).
export type ChangeView = {
  entity: SyncEntity;
  id: string;
  op: 'create' | 'update' | 'delete';
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

// A write tool's result: the change card with "Cofnij" (§5.9.2). `groupId` is null when the
// call changed nothing.
export type WriteToolOutput = { groupId: string | null; changes: ChangeView[] };

export type ProposalStatus = 'pending' | 'confirmed' | 'rejected';

// A risky tool's result: the confirmation card (§5.9.3). Confirming writes the change group
// `groupId`; the stored message gets the status, so the card shows it on every device.
export type ProposalToolOutput = {
  proposalId: string;
  status: ProposalStatus;
  changes: ChangeView[];
  groupId?: string;
};

// A proposed workout (§5.9.6): the plan card. `changes` stay empty, also once confirmed: the plan
// tells what the card shows, and a list of every set would go to the model on each later turn.
// `replaces` is how many planned sets of the day accepting it removes.
export type PlanToolOutput = ProposalToolOutput & {
  date: string;
  plan: WorkoutPlan;
  replaces: number;
};

// A tool that couldn't run, with the reason for the model (e.g. `exercise_not_found`).
export type ToolErrorOutput = { error: string } & Record<string, unknown>;

export type ProvidersResponse = {
  providers: { id: Provider; configured: boolean; defaults: Record<keyof ModelSettings, string> }[];
  models: ModelSettings;
};
