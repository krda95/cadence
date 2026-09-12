import { Component, inject, OnInit, signal } from '@angular/core';

import { DashboardResponse } from '@models/dashboardModel';
import { DashboardService } from '@core/api/dashboard.service';
import { RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { AuthService } from '@core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe, DecimalPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private readonly dashboardService = inject(DashboardService);
  private readonly authService = inject(AuthService);
  readonly currentUser = this.authService.currentUser;
  readonly today = new Date();

  dashboard = signal<DashboardResponse | null>(null);
  isLoading = signal(true);

  ngOnInit(): void {
    this.dashboardService.getDashboard().subscribe({
      next: (dashboard) => {
        this.dashboard.set(dashboard);
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Failed to load dashboard', error);
        this.isLoading.set(false);
      },
    });
  }

  getScoreColor(progress: number | null): string {
    if (progress === null) {
      return 'var(--color-score-great)';
    }

    if (progress > 90) {
      return 'var(--color-score-great)';
    }

    if (progress > 75) {
      return 'var(--color-score-good)';
    }

    if (progress > 60) {
      return 'var(--color-score-could-do-more)';
    }

    return 'var(--color-score-needs-work)';
  }

  getScoreLabel(progress: number | null): string {
    if (progress === null) {
      return 'No score';
    }

    if (progress > 90) {
      return 'Great';
    }

    if (progress > 75) {
      return 'Good';
    }

    if (progress > 60) {
      return 'Could do more';
    }

    return 'Needs work';
  }

  getScoreDescription(progress: number | null): string {
    if (progress === null) {
      return 'No score available.';
    }

    if (progress > 90) {
      return "You're looking really good!";
    }

    if (progress > 75) {
      return 'Keep it up, you can still make it!';
    }

    if (progress > 60) {
      return 'Try to get back on track.';
    }

    return 'Focus, you need to work a bit more on your progress.';
  }
}
