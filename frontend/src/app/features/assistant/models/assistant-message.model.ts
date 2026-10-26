export type AssistantRole = 'user' | 'assistant';

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  content: string;
}
