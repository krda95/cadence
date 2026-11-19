import { Component, computed, inject, signal, effect } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe } from '@angular/common';

import { GoalsService } from '@core/api/goals.service';
import { AssistantService } from '@core/api/assistant.service';

import { GoalEntry } from '@shared/components/goal-entry/goal-entry';
import { buildDailyImpacts } from '@shared/utils/daily-impact';
import { ScrollHeader } from '@shared/components/scroll-header/scroll-header';
import { scoreBand } from '@shared/utils/score-band';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-today',
  imports: [GoalEntry, ScrollHeader, DatePipe, DecimalPipe, RouterLink],
  templateUrl: './today.html',
  styleUrl: './today.scss',
})
export class Today {
  private readonly goalsService = inject(GoalsService);
  private readonly assistantService = inject(AssistantService);

  readonly selectedDate = signal(this.getTodayDate());
  readonly editingGoalId = signal<string | null>(null);
  readonly savingGoalId = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly errorGoalId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const version = this.assistantService.dataVersion();

      if (version === 0) {
        return;
      }

      this.goalsResource.reload();
      this.scoreResource.reload();
    });
  }

  readonly goalsResource = rxResource({
    params: () => this.selectedDate(),
    stream: ({ params: date }) => this.goalsService.getEntriesForDate(date),
  });

  readonly scoreResource = rxResource({
    params: () => this.selectedDate(),
    stream: ({ params: date }) => this.goalsService.getDayScore(date),
  });

  readonly goals = computed(() =>
    this.goalsResource.hasValue() ? this.goalsResource.value() : [],
  );
  readonly score = computed(() =>
    this.scoreResource.hasValue() ? this.scoreResource.value() : null,
  );

  /** Per weekly goal: how today's entry changes the daily score (from the daily progress). */
  readonly dailyImpacts = computed(() => buildDailyImpacts(this.score()));

  readonly sections = computed(() => [
    { title: 'Daily', goals: this.goals().filter((goal) => goal.period === 'daily') },
    { title: 'Weekly', goals: this.goals().filter((goal) => goal.period === 'weekly') },
  ]);

  readonly isEmpty = computed(() => this.goalsResource.hasValue() && this.goals().length === 0);

  readonly scoreValue = computed(() => this.score()?.daily_score ?? null);
  readonly band = computed(() => {
    const progress = this.score();

    if (!progress) {
      return scoreBand(null);
    }

    const isPending = !progress.is_final && !progress.has_entries;

    return scoreBand(progress.daily_score, isPending);
  });

  startEditing(goalId: string): void {
    this.saveError.set(null);
    this.editingGoalId.set(goalId);
  }

  cancelEditing(): void {
    this.saveError.set(null);
    this.editingGoalId.set(null);
  }

  saveEntry(event: { goalId: string; value: number; note: string | null }): void {
    this.savingGoalId.set(event.goalId);
    this.saveError.set(null);

    this.goalsService
      .upsertEntry(event.goalId, this.selectedDate(), {
        value: event.value,
        note: event.note,
      })
      .subscribe({
        next: () => {
          this.savingGoalId.set(null);
          this.editingGoalId.set(null);
          this.goalsResource.reload();
          this.scoreResource.reload();
        },
        error: (error) => {
          console.error('Failed to save entry', error);
          this.savingGoalId.set(null);
          this.errorGoalId.set(event.goalId);
          this.saveError.set("Couldn't save your entry. Try again.");
        },
      });
  }

  deleteEntry(event: { goalId: string }): void {
    this.savingGoalId.set(event.goalId);
    this.saveError.set(null);

    this.goalsService.deleteEntry(event.goalId, this.selectedDate()).subscribe({
      next: () => {
        this.savingGoalId.set(null);
        this.editingGoalId.set(null);
        this.goalsResource.reload();
        this.scoreResource.reload();
      },
      error: (error) => {
        console.error('Failed to delete entry', error);
        this.savingGoalId.set(null);
        this.saveError.set("Couldn't delete your entry. Try again.");
      },
    });
  }

  private getTodayDate(): string {
    const today = new Date();

    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
