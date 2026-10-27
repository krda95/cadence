import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideFlame, LucideTrophy } from '@lucide/angular';

import { DashboardService } from '@core/api/dashboard.service';
import { AuthService } from '@core/services/auth.service';
import { scoreBand } from '@shared/utils/score-band';
import { streakColor } from './streak-color';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe, DecimalPipe, LucideFlame, LucideTrophy],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly dashboardService = inject(DashboardService);
  private readonly authService = inject(AuthService);

  readonly currentUser = this.authService.currentUser;
  readonly today = new Date();
  readonly displayWeek = computed(() => {
    const data = this.data();

    if (!data) return null;

    if (data.week.score !== null) {
      return {
        ...data.week,
        period: 'current' as const,
      };
    }

    if (data.previous_week.score !== null) {
      return {
        ...data.previous_week,
        period: 'previous' as const,
      };
    }

    return null;
  });

  readonly dashboard = rxResource({
    stream: () => this.dashboardService.getDashboard(),
  });

  readonly data = computed(() => (this.dashboard.hasValue() ? this.dashboard.value() : null));

  readonly weekBand = computed(() => scoreBand(this.displayWeek()?.score ?? null));
  readonly weekDifference = computed(() => {
    const data = this.data();

    if (!data || data.week.score === null || data.previous_week.score === null) {
      return null;
    }

    return Math.round(data.week.score - data.previous_week.score);
  });
  readonly todayBand = computed(() => scoreBand(this.data()?.today.score ?? null));
  readonly currentStreakColor = computed(() => streakColor(this.data()?.streak.current ?? 0));
  readonly longestStreakColor = computed(() => streakColor(this.data()?.streak.longest ?? 0));
}
