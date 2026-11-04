export type Base = { id: string; createdAt: string };
export type Product = Base & {
  name: string;
  category: string;
  description: string;
  priceCents: number;
  unit: string;
  active: boolean;
};
export type ProposalTemplate = Base & {
  name: string;
  title: string;
  intro: string;
  terms: string;
  validDays: number;
  googleDocTemplateId?: string;
};
export type Contact = Base & {
  name: string;
  company: string;
  phone: string;
  stage: string;
  notes: string;
  conversationId?: string;
  automationAllowed: boolean;
  demo?: boolean;
};
export type ProposalLine = {
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  unit: string;
};
export type ProposalStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "queued"
  | "sent"
  | "simulated"
  | "delivery_unknown"
  | "blocked";
export type Proposal = Base & {
  number: string;
  contactId: string;
  contactName: string;
  conversationId?: string;
  templateName: string;
  title: string;
  intro: string;
  terms: string;
  notes: string;
  lines: ProposalLine[];
  totalCents: number;
  currency: "BRL";
  validUntil: string;
  status: ProposalStatus;
  snapshotHash: string;
  revision: number;
  sourceKey?: string;
  approvedBy?: string;
  approvedAt?: string;
  reviewNote?: string;
  sentAt?: string;
  deliveryMessageId?: string;
};
export type AutomationRule = Base & {
  name: string;
  fromStage: string;
  toStage: string;
  templateId: string;
  productIds: string[];
  active: boolean;
  requireApproval: true;
};
export type Job = Base & {
  kind: "notify_approval" | "send_proposal";
  proposalId: string;
  state: "pending" | "running" | "done" | "blocked" | "unknown";
  attempts: number;
  lastError?: string;
};
export type Usage = Base & {
  provider: string;
  model: string;
  task: string;
  environment: "lab" | "production";
  inputTokens: number;
  outputTokens: number;
  audioSeconds?: number;
  characters?: number;
  estimatedCostMicros: number | null;
  currency: "USD";
  status: "success" | "failed" | "simulated";
};
export type Audit = Base & {
  action: string;
  subjectId: string;
  actor: string;
  detail: string;
};
export type WebhookEvent = Base & {
  type: string;
  contactId?: string;
  processed: boolean;
  jobId?: string;
};
export type Session = Base & { email: string; expiresAt: number };
export type AgentSettings = Base & {
  name: string;
  tone: string;
  instructions: string;
  splitMode: "single" | "paragraphs";
  maxChunks: number;
  delayMs: number;
  voiceMode: "text" | "audio" | "adaptive";
};
export type EntityMap = {
  operation: Operation;
  conversation: Conversation;
  message: ConversationMessage;
  runtimeJob: RuntimeJob;
  followup: FollowupExecution;
  handoff: HumanHandoff;
  product: Product;
  template: ProposalTemplate;
  contact: Contact;
  proposal: Proposal;
  rule: AutomationRule;
  job: Job;
  event: WebhookEvent;
  usage: Usage;
  audit: Audit;
  session: Session;
  settings: AgentSettings;
};
export type EntityKind = keyof EntityMap;
export type IntegrationStatus = {
  id: string;
  name: string;
  description: string;
  category: string;
  status: "configured" | "not_configured" | "planned";
  capabilities: string[];
  limitation?: string;
};
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );

export type ModuleKey = "catalog" | "proposals" | "calendar";
export type Operation = Base & {
  revision: number;
  agentEnabled: boolean;
  testMode?: { enabled: boolean; phones: string[] };
  handoff?: { enabled: boolean; onImage: boolean; recordNote: boolean };
  modules: Record<ModuleKey, boolean>;
  specialists: {
    id: "qualification" | "knowledge" | "catalog" | "calendar" | "proposals";
    enabled: boolean;
    instructions: string;
    model: string;
  }[];
  followup: {
    enabled: boolean;
    steps: { delayMinutes: number; instruction: string }[];
    timeZone: string;
    weekdays: number[];
    start: string;
    end: string;
    maxPerDay: number;
    terminalStages: string[];
  };
};
export type Conversation = Base & {
  contactId: string;
  stage: string;
  channel: "evolution" | "official" | "unknown";
  status: "active" | "closed" | "opted_out" | "paused";
  cycle: number;
  lastInboundAt?: string;
  lastOutboundAt?: string;
  followupStep: number;
  deliveryUnknown?: boolean;
  manualState?: "paused" | "closed";
  handoffId?: string;
};
export type ConversationMessage = Base & {
  conversationId: string;
  role: "user" | "assistant";
  text: string;
  occurredAt: string;
  source: "central" | "reply" | "followup";
  centralMessageId?: string;
  simulated?: boolean;
};
export type RuntimeJob = Base & {
  kind: "reply" | "followup" | "record_followup" | "record_handoff";
  conversationId: string;
  contactId: string;
  state:
    | "pending"
    | "running"
    | "dispatching"
    | "done"
    | "cancelled"
    | "blocked"
    | "unknown";
  attempts: number;
  dueAt: string;
  cycle: number;
  step: number;
  policyRevision: number;
  executionId?: string;
  lastError?: string;
  resultText?: string;
  demoOnly?: boolean;
};
export type FollowupExecution = Base & {
  conversationId: string;
  contactId: string;
  step: number;
  text: string;
  sentAt: string;
  centralMessageId?: string;
  taskState: "pending" | "done" | "blocked" | "simulated";
  taskId?: string;
  simulated: boolean;
  lastError?: string;
};

export type HumanHandoff = Base & {
  conversationId: string;
  contactId: string;
  reason: string;
  summary: string;
  noteState: "pending" | "done" | "blocked" | "not_requested";
  centralNoteId?: string;
  lastError?: string;
};
