import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';

import { StartupService } from '@core/services/startup.service';
import { Logo } from '@shared/ui/logo/logo';

@Component({
  selector: 'app-wake-up',
  imports: [Logo],
  templateUrl: './wake-up.html',
  styleUrl: './wake-up.scss',
})
export class WakeUp implements OnInit, OnDestroy {
  readonly startupService = inject(StartupService);
  readonly messageVisible = signal(true);

  private transitionTimeout: ReturnType<typeof setTimeout> | null = null;

  private readonly messages = [
    {
      title: 'Starting your workspace...',
      description: 'Cadence is connecting to its services.',
    },
    {
      title: 'Waking things up...',
      description: 'Due to inactivity, it may take a while to initialize.',
    },
    {
      title: 'Almost there...',
      description: 'Thanks for your patience, still connecting.',
    },
  ];

  readonly currentMessage = signal(this.messages[0]);

  private messageIndex = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.intervalId = setInterval(() => {
      this.messageVisible.set(false);

      this.transitionTimeout = setTimeout(() => {
        this.messageIndex++;

        this.currentMessage.set(this.messages[this.messageIndex]);
        this.messageVisible.set(true);

        this.transitionTimeout = null;

        if (this.messageIndex === this.messages.length - 1) {
          if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
          }
        }
      }, 250);
    }, 10_000);
  }

  ngOnDestroy(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
    }
    if (this.transitionTimeout !== null) {
      clearTimeout(this.transitionTimeout);
    }
  }
}
