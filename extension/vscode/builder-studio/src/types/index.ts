/* ── Workflow types — mirrors the canvas structures in convengine-ui ── */

export interface WorkflowNode {
  id: string;
  data?: {
    blockType?: string;
    title?: string;
    disabled?: boolean;
    [k: string]: unknown;
  };
  position?: { x: number; y: number };
  [k: string]: unknown;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  [k: string]: unknown;
}

export interface Workflow {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  subBlockValues: Record<string, Record<string, unknown>>;
}

export interface TraceEntry {
  nodeId: string;
  blockType?: string;
  title?: string;
  input: unknown;
  inputsByHandle?: Record<string, unknown>;
  output?: unknown;
  values?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  error?: string;
  errorDetail?: Record<string, unknown>;
  ms: number;
}

export interface RunResult {
  output: unknown;
  trace: TraceEntry[];
  error?: string;
}

/* ── Agent types ── */

export interface AgentMemoryConfig {
  type: 'conversation' | 'sliding_window' | 'sliding_window_tokens';
  conversationId?: string;
  /** sliding_window: max number of prior messages to include */
  windowSize?: number;
  /** sliding_window_tokens: max token budget for prior messages (rough word estimate) */
  maxTokens?: number;
}

export interface AgentRequest {
  agent: {
    id: string;
    provider?: string;
    model?: string;
    temperature?: number;
    systemPrompt?: string;
    userPrompt?: string;
    responseFormat?: string | null;
    strictOutput?: boolean;
    skills?: string[];
    memory?: AgentMemoryConfig | null;
  };
  input: string;
}

export interface AgentResponse {
  output: string;
  model: string;
  ms: number;
}

/* ── Skill ── */

export interface Skill {
  id: string;
  name: string;
  language?: string;
  source: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/* ── Workspace persistence ── */

export interface WorkspaceSnapshot {
  activeWorkspaceId?: string;
  activeWorkflowId?: string;
  workspaces?: unknown[];
  teams?: unknown[];
  agentPools?: unknown[];
  agents?: unknown[];
  skills?: Skill[];
  workflows?: unknown[];
  llmConfig?: Record<string, unknown> | null;
}

/* ── MCP ── */

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  /** Canonical transport stored internally */
  type: 'http' | 'sse' | 'stdio';
  /** Alias used by the React UI (STDIO | HTTP). Mapped to/from `type` at the boundary. */
  transport?: 'STDIO' | 'HTTP' | 'SSE';
  command?: string;   // for stdio servers
  args?: string[];    // for stdio servers
  env?: Record<string, string>;
  headers?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}
