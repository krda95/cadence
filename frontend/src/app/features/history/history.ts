import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { GoalsService } from '@core/api/goals.service';
import { GoalEntryDayResponse } from '@models/goalModel';
import moment, { min } from 'moment';
import { GoalEntry } from '@shared/components/goal-entry/goal-entry';
import { Button } from '@shared/ui/button/button';
import { DailyProgressResponse } from '@models/progressModel';

@Component({
  selector: 'app-history',
  imports: [DatePipe, GoalEntry, Button],
  templateUrl: './history.html',
  styleUrl: './history.scss',
})
export class History implements OnInit {
  [x: string]: any;
  selectedDate = signal(this.getYesterday());
  private goalsService = inject(GoalsService);
  goals = signal<GoalEntryDayResponse[]>([]);
  editingGoalId = signal<string | null>(null);
  dailyScore = signal<DailyProgressResponse | null>(null);

  dailyGoals = computed(() => this.goals().filter((goal) => goal.period === 'daily'));
  weeklyGoals = computed(() => this.goals().filter((goal) => goal.period === 'weekly'));

  dates = computed(() => {
    const selected = this.selectedDate();
    const dateRangeEnd = min(moment(selected).add(6, 'd'), moment(this.getYesterday()));

    return Array.from({ length: 12 }, (_, index) => {
      const date = moment(dateRangeEnd).add(-index, 'd');

      return date.toDate();
    }).sort((a, b) => a.getTime() - b.getTime());
  });

  private getYesterday(): Date {
    const date = new Date();

    date.setDate(date.getDate() - 1);

    return date;
  }

  public getDailyScore(): void {
    this.goalsService.getDayScore(this.getSelectedDateString()).subscribe({
      next: (score) => {
        this.dailyScore.set(score);
      },
      error: (error) => {
        console.error('Failed to load goal entries', error);
      },
    });
  }

  private getSelectedDateString(): string {
    const selected = this.selectedDate();

    const year = selected.getFullYear();
    const month = String(selected.getMonth() + 1).padStart(2, '0');
    const day = String(selected.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  isSelectedDayYesterday(): boolean {
    return moment(this.selectedDate()).isSame(this.getYesterday(), 'd');
  }

  selectDate(date: Date): void {
    this.selectedDate.set(date);
    this.loadGoals();
    this.getDailyScore();
  }

  incrementBy(days: number) {
    this.selectedDate.set(moment(this.selectedDate()).add(days, 'd').toDate());
    this.loadGoals();
    this.getDailyScore();
  }

  ngOnInit(): void {
    this.loadGoals();
    this.getDailyScore();
  }

  private loadGoals(): void {
    this.goalsService.getEntriesForDate(this.getSelectedDateString()).subscribe({
      next: (goals) => {
        this.goals.set(goals);
      },
      error: (error) => {
        console.error('Failed to load goal entries', error);
      },
    });
  }

  saveEntry(event: { goalId: string; value: number; note: string | null }): void {
    this.goalsService
      .upsertEntry(event.goalId, this.getSelectedDateString(), {
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
