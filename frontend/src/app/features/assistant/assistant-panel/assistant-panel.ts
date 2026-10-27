import {
  afterRenderEffect,
  Component,
  ElementRef,
  output,
  signal,
  viewChild,
  inject,
  DestroyRef,
  afterNextRender,
} from '@angular/core';
import { LucideX, LucideArrowUp, LucideBot } from '@lucide/angular';

import { AssistantMessage } from '../assistant-message/assistant-message';
import {
  AssistantChatRequest,
  AssistantMessage as Message,
} from '../models/assistant-message.model';
import { AssistantService } from '../../../core/api/assistant.service';
import { AssistantHistoryService } from '../services/assistant-history.service';

@Component({
  selector: 'app-assistant-panel',
  imports: [LucideX, LucideArrowUp, LucideBot, AssistantMessage],
  templateUrl: './assistant-panel.html',
  styleUrl: './assistant-panel.scss',
})
export class AssistantPanel {
  readonly closeAssistant = output<void>();
  private readonly historyService = inject(AssistantHistoryService);
  private readonly destroyRef = inject(DestroyRef);
  readonly messages = this.historyService.messages;

  readonly welcomeMessage: Message = {
    id: 'welcome',
    role: 'assistant',
    content:
      'Hi! Tell me what you did and I\'ll log it. Try:\n"I walked 8500 steps and studied for 45 min"',
  };

  readonly draft = this.historyService.draft;
  private readonly messageInput = viewChild<ElementRef<HTMLTextAreaElement>>('messageInput');

  private readonly messagesContainer = viewChild<ElementRef<HTMLDivElement>>('messagesContainer');

  private readonly assistantService = inject(AssistantService);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  private failedRequest: AssistantChatRequest | null = null;

  private requestAssistant(request: AssistantChatRequest): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.assistantService.sendMessage(request).subscribe({
      next: (response) => {
        this.historyService.addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.message,
        });
        this.assistantService.notifyDataChanged();
        this.failedRequest = null;
        this.isLoading.set(false);
      },

      error: (error) => {
        console.error('Assistant request failed:', error);

        this.failedRequest = request;

        this.errorMessage.set('Something went wrong. Please try again.');

        this.isLoading.set(false);
      },
    });
  }

  constructor() {
    this.historyService.clearIfExpired();

    const interval = setInterval(() => {
      this.historyService.clearIfExpired();
    }, 30_000);

    afterNextRender(() => {
      this.messageInput()?.nativeElement.focus();
    });

    this.destroyRef.onDestroy(() => clearInterval(interval));
    afterRenderEffect({
      write: () => {
        this.messages();

        const container = this.messagesContainer()?.nativeElement;

        if (!container) {
          return;
        }

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        container.scrollTo({
          top: container.scrollHeight,

          behavior: reduceMotion ? 'instant' : 'smooth',
        });
      },
    });
  }

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

    if (!content || this.isLoading()) {
      return;
    }

    this.errorMessage.set(null);

    const history = this.messages()
      .slice(-10)
      .map(({ role, content }) => ({
        role,
        content,
      }));

    this.historyService.addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content,
    });

    this.draft.set('');

    const textarea = this.messageInput()?.nativeElement;

    if (textarea) {
      textarea.value = '';
      this.resizeTextarea();
    }

    this.isLoading.set(true);

    this.requestAssistant({
      message: content,
      history,
    });
  }

  retryMessage(): void {
    if (!this.failedRequest || this.isLoading()) {
      return;
    }

    this.requestAssistant(this.failedRequest);
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
