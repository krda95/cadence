import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { GoalsService } from '@core/api/goals.service';
import { GoalEntryDayResponse } from '@models/goalModel';
import moment, { min } from 'moment';
import { GoalEntry } from '@shared/components/goal-entry/goal-entry';
import { Button } from '@shared/ui/button/button';
import { DayProgressResponse } from '@models/progressModel';

@Component({
  selector: 'app-history',
  imports: [DatePipe, GoalEntry, Button, DecimalPipe],
  templateUrl: './history.html',
  styleUrl: './history.scss',
})
export class History implements OnInit {
  selectedDate = signal(this.getYesterday());
  private goalsService = inject(GoalsService);
  goals = signal<GoalEntryDayResponse[]>([]);
  editingGoalId = signal<string | null>(null);
  rangeScore = signal<DayProgressResponse[] | null>(null);

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

  dateRange = computed(() => {
    const dates = this.dates();

    return { from: dates[0], to: dates[dates.length - 1] };
  });

  private getYesterday(): Date {
    const date = new Date();

    date.setDate(date.getDate() - 1);

    return date;
  }

  isSelectedDate(date: Date) {
    return moment(date).isSame(this.selectedDate(), 'd');
  }

  isSelectedMinimalDate(): boolean {
    const allowedDates = this.rangeScore()
      ?.filter((d) => d.daily_score !== null)
      .map((d) => moment(d.date));

    if (!allowedDates || allowedDates.length === 0) {
      return false;
    }

    const minDate = min(allowedDates);

    return moment(this.selectedDate()).isSame(minDate, 'd');
  }

  public getRangeScore(): void {
    const { from, to } = this.dateRange();

    this.goalsService
      .getProgressRange(this.getSelectedDateString(from), this.getSelectedDateString(to))
      .subscribe({
        next: (score) => {
          this.rangeScore.set(score);
        },
        error: (error) => {
          console.error('Failed to load goal entries', error);
        },
      });
  }

  public getScoreForDay(date: Date): number | null {
    const score = this.rangeScore()?.find((day) => moment(day.date).isSame(date, 'd'));
    return score?.daily_score ?? null;
  }

  private getSelectedDateString(date?: Date): string {
    const selected = date ?? this.selectedDate();

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
    this.getRangeScore();
  }

  incrementBy(days: number) {
    this.selectedDate.set(moment(this.selectedDate()).add(days, 'd').toDate());
    this.loadGoals();
    this.getRangeScore();
  }

  ngOnInit(): void {
    this.loadGoals();
    this.getRangeScore();
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
          this.getRangeScore();
        },
        error: (error) => {
          console.error('Failed to save entry', error);
        },
      });
  }
}
