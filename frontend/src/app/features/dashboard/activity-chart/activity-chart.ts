import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe } from '@angular/common';
import { LucideChevronLeft, LucideChevronRight } from '@lucide/angular';

import { DashboardService } from '@core/api/dashboard.service';
import { scoreBand } from '@shared/utils/score-band';

@Component({
  selector: 'app-activity-chart',
  imports: [DatePipe, DecimalPipe, LucideChevronLeft, LucideChevronRight],
  templateUrl: './activity-chart.html',
  styleUrl: './activity-chart.scss',
})
export class ActivityChart {
  private readonly dashboardService = inject(DashboardService);

  readonly period = signal<'week' | 'month'>('week');
  readonly offset = signal(0);

  readonly resource = rxResource({
    params: () => ({
      period: this.period(),
      offset: this.offset(),
    }),
    stream: ({ params }) => this.dashboardService.getDashboard(params.period, params.offset),
  });

  readonly activity = computed(() =>
    this.resource.hasValue() ? this.resource.value().activity : null,
  );

  readonly canGoPrevious = computed(() => {
    const activity = this.activity();

    return activity !== null && this.offset() < activity.max_offset;
  });

  readonly canGoNext = computed(() => this.offset() > 0);

  readonly bars = computed(() =>
    (this.activity()?.data ?? []).map((day) => ({
      ...day,
      height: day.score ?? 0,
      color: day.score === null ? 'var(--color-border)' : scoreBand(day.score).color,
    })),
  );

  readonly skeletonBars = computed(() => {
    const count = this.period() === 'week' ? 7 : 31;

    return Array.from({ length: count }, (_, index) => 30 + ((index * 17 + 13) % 60));
  });

  readonly dateRange = computed(() => {
    const activity = this.activity();

    if (!activity) return '';

    const start = this.parseDate(activity.date_from);
    const end = this.parseDate(activity.date_to);

    const formatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    });

    return `${formatter.format(start)} – ${formatter.format(end)}`;
  });

  setPeriod(period: 'week' | 'month'): void {
    if (this.period() === period) return;

    this.period.set(period);
    this.offset.set(0);
  }

  previousPeriod(): void {
    if (!this.canGoPrevious()) return;

    this.offset.update((offset) => offset + 1);
  }

  nextPeriod(): void {
    if (!this.canGoNext()) return;

    this.offset.update((offset) => offset - 1);
  }

  private parseDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);

    return new Date(year, month - 1, day);
  }
}
