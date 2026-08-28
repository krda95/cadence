import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { GoalsService } from '@core/api/goals.service';
import { GoalResponse } from '@models/goalModel';
import { LucidePencil, LucidePlus } from '@lucide/angular';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Button } from '@shared/ui/button/button';
import { Icon } from '@shared/ui/icon/icon';

type GoalStatusFilter = 'active' | 'inactive' | 'all';

@Component({
  selector: 'app-goals',
  imports: [RouterOutlet, LucidePencil, LucidePlus, NgTemplateOutlet, DecimalPipe, Button, Icon],
  standalone: true,
  templateUrl: './goals.html',
  styleUrl: './goals.scss',
})
export class Goals implements OnInit {
  private readonly router = inject(Router);
  private readonly goalService = inject(GoalsService);
  private readonly cdr = inject(ChangeDetectorRef);

  goals: GoalResponse[] = [];
  dailyGoals: GoalResponse[] = [];
  weeklyGoals: GoalResponse[] = [];
  monthlyGoals: GoalResponse[] = [];
  statusFilter: GoalStatusFilter = 'active';

  ngOnInit(): void {
    this.getGoals();
  }

  addGoal(): void {
    this.router.navigate(['/goals/new']);
  }

  editGoal(goalId: string): void {
    this.router.navigate([`goals/${goalId}/edit`]);
  }

  filterGoals(): void {
    const filteredGoals = this.goals.filter((goal) => {
      if (this.statusFilter === 'active') {
        return goal.is_active;
      }

      if (this.statusFilter === 'inactive') {
        return !goal.is_active;
      }

      return true;
    });

    this.dailyGoals = filteredGoals.filter((goal) => goal.period === 'daily');
    this.weeklyGoals = filteredGoals.filter((goal) => goal.period === 'weekly');
    this.monthlyGoals = filteredGoals.filter((goal) => goal.period === 'monthly');
  }

  onStatusFilterChange(event: Event): void {
    const select = event.target as HTMLSelectElement;

    this.statusFilter = select.value as GoalStatusFilter;
    this.filterGoals();
  }

  getGoals(): void {
    this.goalService.getGoals().subscribe({
      next: (goals) => {
        this.goals = goals;
        this.filterGoals();
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Failed to load goals:', error);
      },
    });
  }
}
