import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe } from '@angular/common';

import { GoalsService } from '@core/api/goals.service';
import { GoalEntry } from '@shared/components/goal-entry/goal-entry';
import { scoreBand } from '@shared/utils/score-band';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-today',
  imports: [GoalEntry, DatePipe, DecimalPipe, RouterLink],
  templateUrl: './today.html',
  styleUrl: './today.scss',
})
export class Today {
  private readonly goalsService = inject(GoalsService);

  readonly selectedDate = signal(this.getTodayDate());
  readonly editingGoalId = signal<string | null>(null);
  readonly savingGoalId = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);

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

  readonly sections = computed(() => [
    { title: 'Daily', goals: this.goals().filter((goal) => goal.period === 'daily') },
    { title: 'Weekly', goals: this.goals().filter((goal) => goal.period === 'weekly') },
  ]);

  /** Only true once the goals request succeeded and returned nothing. */
  readonly isEmpty = computed(() => this.goalsResource.hasValue() && this.goals().length === 0);

  readonly scoreValue = computed(() => this.score()?.daily_score ?? null);
  readonly band = computed(() => scoreBand(this.scoreValue()));

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
          this.saveError.set("Couldn't save your entry. Try again.");
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
