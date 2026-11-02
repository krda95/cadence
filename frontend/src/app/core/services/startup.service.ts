import { Injectable, signal, computed } from '@angular/core';

export type StartupStatus = 'idle' | 'connecting' | 'waking' | 'error';

@Injectable({
  providedIn: 'root',
})
export class StartupService {
  private readonly startupDelay = 1500;

  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly status = signal<StartupStatus>('idle');

  readonly isVisible = computed(() => this.status() === 'waking' || this.status() === 'error');

  start(): void {
    this.clearTimer();

    this.status.set('connecting');

    this.timer = setTimeout(() => {
      this.status.set('waking');
    }, this.startupDelay);
  }

  success(): void {
    this.clearTimer();
    this.status.set('idle');
  }

  fail(): void {
    this.clearTimer();
    this.status.set('error');
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
