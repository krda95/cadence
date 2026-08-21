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
}
