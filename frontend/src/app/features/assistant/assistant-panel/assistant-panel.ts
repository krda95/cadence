import { Component, ElementRef, output, signal, viewChild } from '@angular/core';
import { LucideX, LucideSparkles, LucideSend } from '@lucide/angular';

import { AssistantMessage } from '../assistant-message/assistant-message';
import { AssistantMessage as Message } from '../models/assistant-message.model';

@Component({
  selector: 'app-assistant-panel',
  imports: [LucideX, LucideSparkles, LucideSend, AssistantMessage],
  templateUrl: './assistant-panel.html',
  styleUrl: './assistant-panel.scss',
})
export class AssistantPanel {
  readonly closeAssistant = output<void>();
  readonly messages = signal<Message[]>([
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: 'Hi! Tell me what you did and I’ll log it. Try: "8500 steps and studied 45 min"',
    },
  ]);

  readonly draft = signal('');
  private readonly messageInput = viewChild<ElementRef<HTMLTextAreaElement>>('messageInput');

  resizeTextarea(): void {
    const textarea = this.messageInput()?.nativeElement;

    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';

    const styles = getComputedStyle(textarea);
    const lineHeight = parseFloat(styles.lineHeight);
    const padding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);

    const maxHeight = lineHeight * 5 + padding;

    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  onDraftInput(value: string): void {
    this.draft.set(value);
    this.resizeTextarea();
  }

  sendMessage(): void {
    const content = this.draft().trim();

    if (!content) {
      return;
    }

    this.messages.update((messages) => [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content,
      },
    ]);

    this.draft.set('');

    const textarea = this.messageInput()?.nativeElement;

    if (textarea) {
      textarea.value = '';
      this.resizeTextarea();
    }
  }

  onEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;

    if (keyboardEvent.shiftKey || keyboardEvent.isComposing) {
      return;
    }

    keyboardEvent.preventDefault();
    this.sendMessage();
  }
}
