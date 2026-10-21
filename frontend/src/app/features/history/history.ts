import { DatePipe, DecimalPipe } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import moment, { min } from 'moment';

import { GoalsService } from '@core/api/goals.service';
import { DayProgressResponse } from '@models/progressModel';
import { GoalEntry } from '@shared/components/goal-entry/goal-entry';
import { Button } from '@shared/ui/button/button';
import { scoreBand } from '@shared/utils/score-band';
import { RouterLink } from '@angular/router';

/** A day button or its skeleton in the picker, as last laid out. */
interface PickerSlot {
  x: number;
  isSkeleton: boolean;
}

@Component({
  selector: 'app-history',
  imports: [DatePipe, GoalEntry, Button, DecimalPipe, RouterLink],
  templateUrl: './history.html',
  styleUrl: './history.scss',
})
export class History {
  private readonly goalsService = inject(GoalsService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly selectedDate = signal(this.getYesterday());
  readonly editingGoalId = signal<string | null>(null);
  readonly savingGoalId = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);

  /** Placeholders for the day picker while scores load. */
  readonly pickerPlaceholders = Array.from({ length: 7 });
  readonly goalPlaceholders = [1, 2, 3];

  /** A 12-day window that slides with the selection, ending 6 days after it (never past yesterday). */
  readonly dates = computed(() => {
    const windowEnd = min(moment(this.selectedDate()).add(6, 'd'), moment(this.getYesterday()));

    return Array.from({ length: 12 }, (_, index) =>
      moment(windowEnd).add(-index, 'd').toDate(),
    ).sort((a, b) => a.getTime() - b.getTime());
  });

  /** Compared by value so selecting a day inside the same range does not refetch scores. */
  readonly dateRange = computed(
    () => {
      const dates = this.dates();

      return {
        from: this.toDateString(dates[0]),
        to: this.toDateString(dates[dates.length - 1]),
      };
    },
    { equal: (a, b) => a.from === b.from && a.to === b.to },
  );

  readonly goalsResource = rxResource({
    params: () => this.toDateString(this.selectedDate()),
    stream: ({ params: date }) => this.goalsService.getEntriesForDate(date),
  });

  readonly rangeResource = rxResource({
    params: () => this.dateRange(),
    stream: ({ params: { from, to } }) => this.goalsService.getProgressRange(from, to),
  });

  readonly goals = computed(() =>
    this.goalsResource.hasValue() ? this.goalsResource.value() : [],
  );
  /** Keeps the previous scores while a new window loads, so the picker never blanks out. */
  readonly rangeScore = linkedSignal<
    DayProgressResponse[] | undefined,
    DayProgressResponse[] | null
  >({
    source: () => (this.rangeResource.hasValue() ? this.rangeResource.value() : undefined),
    computation: (scores, previous) => scores ?? previous?.value ?? null,
  });

  readonly sections = computed(() => [
    { title: 'Daily', goals: this.goals().filter((goal) => goal.period === 'daily') },
    { title: 'Weekly', goals: this.goals().filter((goal) => goal.period === 'weekly') },
  ]);

  /** Only true once the goals request succeeded and returned nothing. */
  readonly isEmpty = computed(() => this.goalsResource.hasValue() && this.goals().length === 0);

  /** Horizontal position of each day button (by timestamp), as of the last layout pass. */
  private pickerPositions: Map<string, PickerSlot> | null = null;

  /** Visual x of the selection highlight as of the last pass, so it can slide to its next spot. */
  private pickerPillX: number | null = null;

  constructor() {
    // Whenever the selection or the scores change, re-centre the picker and slide the days
    // from where they were to where they are now.
    effect(() => {
      this.selectedDate();
      this.rangeScore();

      afterNextRender(() => this.animatePicker(), { injector: this.injector });
    });
  }

  isSelectedDate(date: Date): boolean {
    return moment(date).isSame(this.selectedDate(), 'd');
  }

  getScoreColor(progress: number | null): string {
    if (progress === null) {
      return 'var(--color-score-great)';
    }

    return scoreBand(progress).color;
  }

  isSelectedMinimalDate(): boolean {
    if (this.goalsResource.hasValue() && this.isEmpty()) {
      return true;
    }

    const allowedDates = this.rangeScore()
      ?.filter((d) => d.daily_score !== null)
      .map((d) => moment(d.date));

    if (!allowedDates || allowedDates.length === 0) {
      return false;
    }

    return moment(this.selectedDate()).isSame(min(allowedDates), 'd');
  }

  isSelectedDayYesterday(): boolean {
    return moment(this.selectedDate()).isSame(this.getYesterday(), 'd');
  }

  /** Whether the loaded scores say anything about this day, even "no score". */
  hasDayData(date: Date): boolean {
    return this.rangeScore()?.some((day) => moment(day.date).isSame(date, 'd')) ?? false;
  }

  /** A day that slid into the window and is still waiting for its score. */
  isDayLoading(date: Date): boolean {
    return this.rangeResource.isLoading() && !this.hasDayData(date);
  }

  getScoreForDay(date: Date): number | null {
    const score = this.rangeScore()?.find((day) => moment(day.date).isSame(date, 'd'));

    return score?.daily_score ?? null;
  }

  selectDate(date: Date): void {
    this.rememberPickerPositions();
    this.changeDate(date);
  }

  incrementBy(days: number): void {
    this.rememberPickerPositions();
    this.changeDate(moment(this.selectedDate()).add(days, 'd').toDate());
  }

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
      .upsertEntry(event.goalId, this.toDateString(this.selectedDate()), {
        value: event.value,
        note: event.note,
      })
      .subscribe({
        next: () => {
          this.savingGoalId.set(null);
          this.editingGoalId.set(null);
          this.goalsResource.reload();
          this.rangeResource.reload();
        },
        error: (error) => {
          console.error('Failed to save entry', error);
          this.savingGoalId.set(null);
          this.saveError.set("Couldn't save your entry. Try again.");
        },
      });
  }

  private pickerStrip(): HTMLElement | null {
    return this.host.nativeElement.querySelector('.history__header__bottom');
  }

  /** Layout position of every day button; unaffected by running transform animations. */
  private measurePicker(): Map<string, PickerSlot> {
    const strip = this.pickerStrip();
    const positions = new Map<string, PickerSlot>();

    strip?.querySelectorAll<HTMLElement>('[data-time]').forEach((slot) => {
      positions.set(slot.dataset['time'] as string, {
        x: slot.offsetLeft - strip.scrollLeft,
        isSkeleton: slot.hasAttribute('data-skeleton'),
      });
    });

    return positions;
  }

  /** Called right before the selection changes, so the user's own scrolling is accounted for. */
  private rememberPickerPositions(): void {
    this.pickerPositions = this.measurePicker();

    const strip = this.pickerStrip();
    const pill = strip?.querySelector<HTMLElement>('.history__picker-pill');

    this.pickerPillX =
      strip && pill && pill.style.display === 'block' ? pill.offsetLeft - strip.scrollLeft : null;
  }

  private animatePicker(): void {
    const strip = this.pickerStrip();

    if (!strip) {
      return;
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const previous = this.pickerPositions;

    // Jump to the final scroll position first; the days then animate into place from where
    // they were, so a scrolling strip and a non-scrolling one share the same motion.
    // Scroll the strip itself: scrollIntoView would also scroll the page vertically.
    const selectedSlot = strip.querySelector<HTMLElement>('.selectedDate');

    if (selectedSlot) {
      strip.scrollLeft =
        selectedSlot.offsetLeft - (strip.clientWidth - selectedSlot.offsetWidth) / 2;
    }

    const current = this.measurePicker();

    if (previous && !reduceMotion) {
      strip.querySelectorAll<HTMLElement>('[data-time]').forEach((slot) => {
        const time = slot.dataset['time'] as string;
        const before = previous.get(time);
        const after = current.get(time) as PickerSlot;
        const isSkeleton = slot.hasAttribute('data-skeleton');

        // New slot, or a skeleton that has just been replaced by the real day.
        if (before === undefined || (before.isSkeleton && !isSkeleton)) {
          slot.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
        } else if (Math.abs(before.x - after.x) > 0.5) {
          slot.animate(
            [{ transform: `translateX(${before.x - after.x}px)` }, { transform: 'translateX(0)' }],
            { duration: 320, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
          );
        }
      });
    }

    this.pickerPositions = current;
    this.movePickerPill(strip, reduceMotion);
  }

  /** One highlight sits behind the selected day and slides to the new one, like a segmented control. */
  private movePickerPill(strip: HTMLElement, reduceMotion: boolean): void {
    const pill = strip.querySelector<HTMLElement>('.history__picker-pill');
    const selected = strip.querySelector<HTMLElement>('.selectedDate');

    if (!pill) {
      return;
    }

    if (!selected) {
      pill.style.display = 'none';
      this.pickerPillX = null;
      return;
    }

    Object.assign(pill.style, {
      display: 'block',
      left: `${selected.offsetLeft}px`,
      top: `${selected.offsetTop}px`,
      width: `${selected.offsetWidth}px`,
      height: `${selected.offsetHeight}px`,
    });

    const after = selected.offsetLeft - strip.scrollLeft;
    const before = this.pickerPillX;

    if (before !== null && !reduceMotion && Math.abs(before - after) > 0.5) {
      pill.animate(
        [{ transform: `translateX(${before - after}px)` }, { transform: 'translateX(0)' }],
        { duration: 320, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
      );
    }

    this.pickerPillX = after;
  }

  private changeDate(date: Date): void {
    this.cancelEditing();
    this.selectedDate.set(date);
  }

  private getYesterday(): Date {
    const date = new Date();

    date.setDate(date.getDate() - 1);

    return date;
  }

  private toDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
