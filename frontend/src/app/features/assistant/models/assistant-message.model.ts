export type AssistantRole = 'user' | 'assistant';

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  content: string;
}

export interface AssistantChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantChatRequest {
  message: string;
  history: AssistantChatHistoryMessage[];
}

export interface AssistantChatResponse {
  message: string;
}
