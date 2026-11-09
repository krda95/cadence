import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe } from '@angular/common';
import { LucideChevronLeft, LucideChevronRight } from '@lucide/angular';

import { DashboardService } from '@core/api/dashboard.service';
import { DashboardActivityResponse } from '@models/dashboardModel';
import { scoreBand } from '@shared/utils/score-band';

const TOUCH_TOOLTIP_LINGER_MS = 1500;
const TOOLTIP_EDGE_MARGIN_PX = 8;
const SLIDE_DISTANCE_PX = 24;

@Component({
  selector: 'app-activity-chart',
  imports: [DatePipe, DecimalPipe, LucideChevronLeft, LucideChevronRight],
  templateUrl: './activity-chart.html',
  styleUrl: './activity-chart.scss',
})
export class ActivityChart {
  private readonly dashboardService = inject(DashboardService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly period = signal<'week' | 'month'>('week');
  readonly offset = signal(0);

  readonly resource = rxResource({
    params: () => ({
      period: this.period(),
      offset: this.offset(),
    }),
    stream: ({ params }) => this.dashboardService.getDashboard(params.period, params.offset),
  });

  /** Last successfully loaded activity – kept while the next period is loading. */
  private readonly lastActivity = linkedSignal<
    DashboardActivityResponse | null,
    DashboardActivityResponse | null
  >({
    source: () => (this.resource.hasValue() ? this.resource.value().activity : null),
    computation: (next, previous) => next ?? previous?.value ?? null,
  });

  /**
   * Activity to render. Stale data is reused only for the same period, so a
   * week/month switch shows a skeleton instead of a mismatched grid.
   */
  readonly activity = computed(() => {
    const activity = this.lastActivity();

    return activity && activity.period === this.period() ? activity : null;
  });

  /** True while a new period loads and the previous bars are still on screen. */
  readonly isRefreshing = computed(() => this.resource.isLoading() && this.activity() !== null);

  readonly canGoPrevious = computed(() => {
    const activity = this.activity();

    return activity !== null && this.offset() < activity.max_offset;
  });

  readonly canGoNext = computed(() => this.offset() > 0);

  readonly bars = computed(() =>
    (this.activity()?.data ?? []).map((day) => {
      const date = this.parseDate(day.date);

      return {
        ...day,
        height: day.score ?? 0,
        color: day.score === null ? 'var(--color-border)' : scoreBand(day.score).color,
        label: this.axisLabel(date),
      };
    }),
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

  /** Index of the bar that is reachable with Tab (roving tabindex). */
  readonly focusIndex = signal(0);

  /** Bar whose tooltip is shown (pointer scrubbing or keyboard focus). */
  readonly activeIndex = signal<number | null>(null);

  /** Horizontal nudge (px) that keeps the active tooltip inside the card. */
  readonly tooltipShift = signal(0);

  /** -1 = moving to an older period, 1 = to a newer one, 0 = no direction. */
  private direction = 0;
  private lastRangeKey: string | null = null;
  private enterAnimation: Animation | null = null;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;
  private pointerInside = false;

  constructor() {
    // Runs after the new bars are in the DOM: slide them in from the direction of travel.
    afterRenderEffect(() => {
      const key = this.activity()?.date_from ?? null;

      if (key === null || key === this.lastRangeKey) return;

      const isFirstLoad = this.lastRangeKey === null;
      this.lastRangeKey = key;

      if (!isFirstLoad) this.playEnter();
    });
  }

  setPeriod(period: 'week' | 'month'): void {
    if (this.period() === period) return;

    this.direction = 0;
    this.clearActive();
    this.period.set(period);
    this.offset.set(0);
    this.focusIndex.set(0);
  }

  previousPeriod(): void {
    if (!this.canGoPrevious()) return;

    this.direction = -1;
    this.clearActive();
    this.offset.update((offset) => offset + 1);
  }

  nextPeriod(): void {
    if (!this.canGoNext()) return;

    this.direction = 1;
    this.clearActive();
    this.offset.update((offset) => offset - 1);
  }

  onBarKeydown(event: KeyboardEvent): void {
    const last = this.bars().length - 1;
    const current = Math.min(this.focusIndex(), last);

    const target = {
      ArrowLeft: current - 1,
      ArrowRight: current + 1,
      Home: 0,
      End: last,
    }[event.key];

    if (target === undefined) return;

    event.preventDefault();

    const next = Math.max(0, Math.min(last, target));

    this.focusIndex.set(next);
    this.host.nativeElement
      .querySelectorAll<HTMLElement>('.activity-chart__bar-column')
      [next]?.focus();
  }

  onBarFocus(index: number, event: FocusEvent): void {
    this.focusIndex.set(index);

    // Mouse/touch focus is handled by pointer scrubbing; only keyboard focus shows the tooltip.
    if ((event.target as HTMLElement).matches(':focus-visible')) this.activate(index);
  }

  onBarBlur(index: number): void {
    if (this.activeIndex() === index && !this.pointerInside) this.clearActive();
  }

  /** Maps the pointer's x position to the nearest bar, so narrow month bars are easy to hit. */
  onPointerMove(event: PointerEvent): void {
    const count = this.bars().length;

    if (count === 0) return;

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = Math.max(0, Math.min(count - 1, Math.floor(ratio * count)));

    this.pointerInside = true;
    this.cancelRelease();

    if (index !== this.activeIndex()) this.activate(index);
  }

  onPointerEnd(event: PointerEvent): void {
    // Touch fires pointerleave right after pointerup – let pointerup decide.
    if (event.pointerType === 'touch' && event.type === 'pointerleave') return;

    this.pointerInside = false;

    if (event.pointerType === 'touch' && event.type === 'pointerup') {
      // A tap should leave the tooltip readable for a moment.
      this.cancelRelease();
      this.releaseTimer = setTimeout(() => this.clearActive(), TOUCH_TOOLTIP_LINGER_MS);

      return;
    }

    this.clearActive();
  }

  private activate(index: number): void {
    const column = this.host.nativeElement.querySelectorAll<HTMLElement>(
      '.activity-chart__bar-column',
    )[index];

    this.tooltipShift.set(column ? this.tooltipShiftFor(column) : 0);
    this.activeIndex.set(index);
  }

  private clearActive(): void {
    this.cancelRelease();
    this.activeIndex.set(null);
  }

  private cancelRelease(): void {
    if (this.releaseTimer !== null) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
  }

  private tooltipShiftFor(column: HTMLElement): number {
    const tooltip = column.querySelector<HTMLElement>('.activity-chart__tooltip');
    const card = this.host.nativeElement.querySelector<HTMLElement>('.activity-chart');

    if (!tooltip || !card) return 0;

    const cardRect = card.getBoundingClientRect();
    const columnRect = column.getBoundingClientRect();
    const center = columnRect.left + columnRect.width / 2;
    const half = tooltip.offsetWidth / 2;

    const overflowLeft = cardRect.left + TOOLTIP_EDGE_MARGIN_PX - (center - half);
    const overflowRight = center + half - (cardRect.right - TOOLTIP_EDGE_MARGIN_PX);

    if (overflowLeft > 0) return overflowLeft;
    if (overflowRight > 0) return -overflowRight;

    return 0;
  }

  private playEnter(): void {
    const bars = this.host.nativeElement.querySelector<HTMLElement>('.activity-chart__bars');

    if (!bars || typeof bars.animate !== 'function') return;

    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const styles = getComputedStyle(this.host.nativeElement.firstElementChild ?? bars);
    const easing = styles.getPropertyValue('--activity-chart-spring').trim() || 'ease-out';
    const duration = parseFloat(styles.getPropertyValue('--activity-chart-spring-duration')) || 400;
    const direction = this.direction;

    this.direction = 0;

    // Interrupted mid-slide: start from where the bars currently are, not from the target.
    let currentX = 0;

    if (this.enterAnimation) {
      currentX = new DOMMatrixReadOnly(getComputedStyle(bars).transform).m41;
      this.enterAnimation.cancel();
    }

    const slide = direction !== 0 && !reduceMotion;
    const from = Math.max(
      -2 * SLIDE_DISTANCE_PX,
      Math.min(2 * SLIDE_DISTANCE_PX, currentX + direction * SLIDE_DISTANCE_PX),
    );

    const animation = bars.animate(
      slide
        ? [{ transform: `translateX(${from}px)` }, { transform: 'none' }]
        : [{ opacity: 0 }, { opacity: 1 }],
      { duration: reduceMotion ? 200 : duration, easing },
    );

    this.enterAnimation = animation;
    animation.onfinish = () => {
      if (this.enterAnimation === animation) this.enterAnimation = null;
    };
    animation.oncancel = () => {
      if (this.enterAnimation === animation) this.enterAnimation = null;
    };
  }

  private axisLabel(date: Date): string {
    if (this.period() === 'week') {
      return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date);
    }

    const day = date.getDate();

    return day === 1 || day % 5 === 0 ? String(day) : '';
  }

  private parseDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);

    return new Date(year, month - 1, day);
  }
}
