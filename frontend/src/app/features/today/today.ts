import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { GoalEntryDayResponse } from '../../models/goalModel';
import { GoalsService } from '../../core/api/goals.service';
import { GoalEntry } from '@shared/components/goal-entry/goal-entry';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-today',
  imports: [GoalEntry, DatePipe],
  templateUrl: './today.html',
  styleUrl: './today.scss',
})
export class Today implements OnInit {
  private goalsService = inject(GoalsService);
  selectedDate = signal('');
  goals = signal<GoalEntryDayResponse[]>([]);
  editingGoalId = signal<string | null>(null);

  dailyGoals = computed(() => this.goals().filter((goal) => goal.period === 'daily'));

  weeklyGoals = computed(() => this.goals().filter((goal) => goal.period === 'weekly'));

  ngOnInit(): void {
    this.selectedDate.set(this.getTodayDate());
    this.loadGoals();
  }

  private loadGoals(): void {
    this.goalsService.getEntriesForDate(this.selectedDate()).subscribe({
      next: (goals) => {
        this.goals.set(goals);
      },
      error: (error) => {
        console.error('Failed to load goal entries', error);
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

  saveEntry(event: { goalId: string; value: number; note: string | null }): void {
    this.goalsService
      .upsertEntry(event.goalId, this.selectedDate(), {
        value: event.value,
        note: event.note,
      })
      .subscribe({
        next: () => {
          this.editingGoalId.set(null);
          this.loadGoals();
        },
        error: (error) => {
          console.error('Failed to save entry', error);
        },
      });
  }
}
