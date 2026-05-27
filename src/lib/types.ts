export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean }
  | { type: 'image'; source?: unknown }
  | { type: 'thinking'; thinking?: string }
  | { type: string; [k: string]: unknown };

export type MessageContent = string | ContentBlock[];

export interface UserEntry {
  type: 'user';
  message: { role: 'user'; content: MessageContent };
  uuid: string;
  parentUuid?: string | null;
  timestamp: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  sessionId?: string;
  cwd?: string;
}

export interface AssistantEntry {
  type: 'assistant';
  message: { role: 'assistant'; content: MessageContent };
  uuid: string;
  parentUuid?: string | null;
  timestamp: string;
  isSidechain?: boolean;
  sessionId?: string;
}

export type LogEntry =
  | UserEntry
  | AssistantEntry
  | ({ type: string } & Record<string, unknown>);

export interface Pair {
  questionEntry: UserEntry;
  additionalQuestionEntries: UserEntry[];
  progressEntries: Array<UserEntry | AssistantEntry>;
  finalAssistantEntry: AssistantEntry | null;
}

export interface CliOptions {
  projectPath: string;
  outDir: string;
  perSession: boolean;
  includeTools: boolean;
  dryRun: boolean;
  verbose: boolean;
  watch: boolean;
}
