import { Injectable, signal } from '@angular/core';

import { AssistantMessage } from '../models/assistant-message.model';

interface StoredAssistantHistory {
  messages: AssistantMessage[];
  lastActivity: number;
}

@Injectable({
  providedIn: 'root',
})
export class AssistantHistoryService {
  private readonly storageKey = 'cadence_assistant_history';
  private readonly maxMessages = 10;
  private readonly timeout = 30 * 60 * 1000;

  private readonly messagesSignal = signal<AssistantMessage[]>(this.loadHistory());

  readonly messages = this.messagesSignal.asReadonly();
  readonly draft = signal('');

  addMessage(message: AssistantMessage): void {
    this.clearIfExpired();

    this.messagesSignal.update((messages) => [...messages, message].slice(-this.maxMessages));

    this.saveHistory();
  }

  clearHistory(): void {
    this.messagesSignal.set([]);
    this.draft.set('');
    sessionStorage.removeItem(this.storageKey);
  }

  clearIfExpired(): void {
    const stored = this.readStorage();

    if (stored && Date.now() - stored.lastActivity >= this.timeout) {
      this.clearHistory();
    }
  }

  private saveHistory(): void {
    const data: StoredAssistantHistory = {
      messages: this.messagesSignal(),
      lastActivity: Date.now(),
    };

    sessionStorage.setItem(this.storageKey, JSON.stringify(data));
  }

  private loadHistory(): AssistantMessage[] {
    const stored = this.readStorage();

    if (!stored) {
      return [];
    }

    if (Date.now() - stored.lastActivity >= this.timeout) {
      sessionStorage.removeItem(this.storageKey);
      return [];
    }

    return stored.messages.slice(-this.maxMessages);
  }

  private readStorage(): StoredAssistantHistory | null {
    try {
      const raw = sessionStorage.getItem(this.storageKey);

      if (!raw) {
        return null;
      }

      const data = JSON.parse(raw) as StoredAssistantHistory;

      if (!Array.isArray(data.messages) || typeof data.lastActivity !== 'number') {
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }
}
