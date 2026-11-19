import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideCheck,
  LucideMinus,
  LucidePencil,
  LucidePencilLine,
  LucidePlus,
} from '@lucide/angular';

import { GoalEntryDayResponse } from '@models/goalModel';
import { Button } from '@shared/ui/button/button';
import { Icon } from '@shared/ui/icon/icon';
import { InputComponent } from '@shared/ui/input/input';
import { DailyImpact } from '@shared/utils/daily-impact';

function roundValue(value: number): number {
  return Math.round(value * 100) / 100;
}

export const QUICK_ACTION_DELAY_MS = 500;

@Component({
  selector: 'app-goal-entry',
  templateUrl: './goal-entry.html',
  styleUrl: './goal-entry.scss',
  imports: [
    Icon,
    DecimalPipe,
    LucideCheck,
    LucidePencilLine,
    LucidePencil,
    LucideMinus,
    LucidePlus,
    Button,
    InputComponent,
    FormsModule,
  ],
})
export class GoalEntry {
  private readonly injector = inject(Injector);

  readonly goal = input.required<GoalEntryDayResponse>();
  readonly isEditing = input(false);
  readonly isSaving = input(false);
  readonly saveError = input<string | null>(null);
  readonly dailyImpact = input<DailyImpact | null>(null);

  readonly entryValue = signal<number | null>(null);
  readonly entryNote = signal('');
  readonly entryValidationError = signal<string | null>(null);
  /** What the user just asked for but the server has not confirmed yet. */
  private readonly pendingValue = signal<number | null>(null);

  /** Today's entry as the card should show it right now. */
  private readonly dayValue = computed(() => this.pendingValue() ?? this.goal().entry_value);

  /** True from the click until fresh data confirms it, so the number can look "not yet saved". */
  readonly hasUnconfirmedValue = computed(() => this.pendingValue() !== null);

  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  /** The value that was sent and is not yet confirmed by fresh data. Later saves compare to it. */
  private sentValue: number | null = null;

  /** A pause ended while a save was still running, so the newest value goes out once it ends. */
  private sendWhenIdle = false;

  /** What Retry sends again after a failed save. */
  private readonly failedValue = signal<number | null>(null);
  readonly canRetry = computed(() => this.failedValue() !== null);

  readonly entrySaved = output<{
    goalId: string;
    value: number;
    note: string | null;
  }>();
  readonly entryDeleted = output<{ goalId: string }>();
  readonly editStarted = output<void>();
  readonly editCancelled = output<void>();

  private readonly actionButton = viewChild<ElementRef<HTMLButtonElement>>('actionButton');
  private readonly valueInput = viewChild<InputComponent>('valueInput');

  readonly isWeekly = computed(() => this.goal().period !== 'daily');

  readonly todayValue = computed(() => {
    const goal = this.goal();
    const entry = this.dayValue() ?? 0;

    // Weekly: what was logged on earlier days plus today's (possibly pending) entry.
    return goal.period === 'daily' ? entry : this.valueBeforeToday() + entry;
  });

  /* For non-daily goals: what was logged in the period before today. */
  readonly valueBeforeToday = computed(() => {
    const goal = this.goal();

    return goal.period === 'daily' ? 0 : goal.period_value - (goal.entry_value ?? 0);
  });

  /** Small tag under the goal name, shown only for a weekly goal with an entry today. */
  readonly impactTag = computed<{ text: string; tone: 'positive' | 'negative' } | null>(() => {
    const goal = this.goal();
    const impact = this.dailyImpact();
    const hasEntryToday = (goal.entry_value ?? 0) > 0;

    if (!impact || !this.isWeekly() || !hasEntryToday) {
      return null;
    }

    if (impact.adjustmentPp > 0) {
      return { text: 'Bonus', tone: 'positive' };
    }

    if (impact.adjustmentPp < 0) {
      return { text: 'Penalty', tone: 'negative' };
    }

    if (impact.countedScore !== null) {
      // The threshold is crossed: a minimum is reached (good), a maximum is breached (bad).
      return goal.target_type === 'min'
        ? { text: 'Reached', tone: 'positive' }
        : { text: 'Breached', tone: 'negative' };
    }

    return null;
  });

  readonly progressPercent = computed(() => {
    const goal = this.goal();

    if (goal.target_value <= 0) {
      return 0;
    }

    // Uses todayValue so the ring moves together with the number, before the save is confirmed.
    const value = this.todayValue();

    if (goal.target_type === 'min') {
      return Math.min((value / goal.target_value) * 100, 100);
    }

    return value / goal.target_value > 1 ? 0 : 100;
  });

  readonly progressLabel = computed(() => {
    const goal = this.goal();
    const percent = Math.round(this.progressPercent());

    if (goal.target_type === 'min') {
      return `${percent}% of target`;
    }

    return percent === 100 ? 'Within limit' : 'Over limit';
  });

  /** An empty input removes today's entry together with its note. */
  readonly isDeleting = computed(
    () => this.entryValue() === null && this.entryValidationError() === null && this.hasEntry(),
  );

  private readonly hasEntry = computed(() => this.goal().entry_value !== null);

  readonly canSave = computed(() => {
    const value = this.entryValue();

    if (this.isSaving()) {
      return false;
    }

    if (this.isDeleting()) {
      return true;
    }

    return value !== null && value >= this.valueBeforeToday();
  });

  readonly canDecrement = computed(() => (this.dayValue() ?? 0) > 0);

  readonly isChecked = computed(() => {
    const value = this.dayValue();

    return value !== null && value >= this.goal().target_value;
  });

  constructor() {
    let wasEditing = false;

    effect(() => {
      const editing = this.isEditing();

      if (wasEditing && !editing) {
        untracked(() =>
          afterNextRender(() => this.actionButton()?.nativeElement.focus(), {
            injector: this.injector,
          }),
        );
      }

      wasEditing = editing;
    });
    // Fresh data caught up with what was asked for or sent, so the temporary values are done.
    effect(() => {
      const stored = this.goal().entry_value;

      untracked(() => {
        if (this.pendingValue() === stored) {
          this.pendingValue.set(null);
        }

        if (this.sentValue === stored) {
          this.sentValue = null;
        }
      });
    });

    // A failed save: go back to what is really stored, and remember the value for Retry.
    // Declared before the idle effect below, so a failure cancels a queued send first.
    effect(() => {
      const failed = this.saveError();

      untracked(() => {
        if (failed) {
          this.failedValue.set(this.pendingValue() ?? this.sentValue);
          this.pendingValue.set(null);
          this.sentValue = null;
          this.sendWhenIdle = false;
          this.clearFlushTimer();
        } else {
          this.failedValue.set(null);
        }
      });
    });

    // One request at a time: a value that had to wait goes out as soon as the save ends.
    effect(() => {
      const saving = this.isSaving();

      untracked(() => {
        if (!saving && this.sendWhenIdle) {
          this.sendWhenIdle = false;
          this.flushPending();
        }
      });
    });
  }

  startEditing(): void {
    this.entryValidationError.set(null);
    this.entryValue.set(this.todayValue());
    this.clearFlushTimer();
    this.sendWhenIdle = false;
    this.pendingValue.set(null);

    this.entryNote.set(this.goal().note ?? '');
    this.valueInput()?.focusAndSelect();
    this.editStarted.emit();
  }

  cancelEditing(): void {
    if (this.isSaving()) {
      return;
    }

    this.editCancelled.emit();
  }

  onEntryValueChange(value: string): void {
    this.entryValidationError.set(null);

    const normalizedValue = value.trim().replace(',', '.');

    if (normalizedValue === '') {
      this.entryValue.set(null);
      return;
    }

    const parsedValue = Number(normalizedValue);

    if (!Number.isFinite(parsedValue)) {
      this.entryValue.set(null);
      this.entryValidationError.set('Enter a valid number.');
      return;
    }

    this.entryValue.set(parsedValue);

    if (parsedValue < 0) {
      this.entryValidationError.set('Value must be zero or greater.');
    }
  }

  onEditorKeydown(event: KeyboardEvent): void {
    if (!this.isEditing()) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.save();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEditing();
    }
  }

  /** Emits the entry. The parent closes the editor once the save has succeeded. */
  save(): void {
    if (!this.canSave()) {
      return;
    }

    if (this.isDeleting()) {
      this.entryDeleted.emit({ goalId: this.goal().goal_id });
      return;
    }

    const enteredValue = this.entryValue();

    if (enteredValue === null) {
      return;
    }

    this.entrySaved.emit({
      goalId: this.goal().goal_id,
      value: enteredValue - this.valueBeforeToday(),
      note: this.entryNote().trim() || null,
    });
  }

  increment(): void {
    const step = this.goal().quick_action_step;

    if (step === null) {
      return;
    }

    this.scheduleValue(roundValue((this.dayValue() ?? 0) + step));
  }

  decrement(): void {
    const step = this.goal().quick_action_step;

    if (step === null || !this.canDecrement()) {
      return;
    }

    this.scheduleValue(Math.max(0, roundValue(this.dayValue()! - step)));
  }

  toggleCheck(): void {
    this.requestValue(this.isChecked() ? 0 : this.goal().target_value);
  }

  /** Sends the value of the last failed save again. */
  retry(): void {
    const value = this.failedValue();

    if (value === null) {
      return;
    }

    this.requestValue(value);
  }

  /** Show the value at once and save it right away (no pause), unless a save is running. */
  private requestValue(value: number): void {
    this.failedValue.set(null);
    this.pendingValue.set(value);
    this.flushPending();
  }

  /** Show the value at once, but wait for a pause in clicking before saving it. */
  private scheduleValue(value: number): void {
    this.failedValue.set(null);
    this.pendingValue.set(value);
    this.clearFlushTimer();
    this.flushTimer = setTimeout(() => this.flushPending(), QUICK_ACTION_DELAY_MS);
  }

  private flushPending(force = false): void {
    this.clearFlushTimer();

    const value = this.pendingValue();

    if (value === null) {
      return;
    }

    // One request at a time, so two saves cannot arrive out of order. The newest value
    // waits for the one in flight (`force` is for a card that is about to disappear).
    if (this.isSaving() && !force) {
      this.sendWhenIdle = true;
      return;
    }

    // Compare with what the server holds, or will hold once the request in flight lands.
    const baseline = this.sentValue ?? this.goal().entry_value;

    // Clicks that cancel out (+ then −) leave nothing to save. From an empty day,
    // "back to 0" means "no entry", not an explicit 0.
    if (value === baseline || (baseline === null && value === 0)) {
      if (this.sentValue === null) {
        this.pendingValue.set(null);
      }

      return;
    }

    this.sentValue = value;
    this.saveQuickValue(value);
  }

  private clearFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  ngOnDestroy(): void {
    // Leaving the page must not lose clicks the user has already seen on the card.
    if (this.flushTimer !== null || this.sendWhenIdle) {
      this.flushPending(true);
    }
  }

  private saveQuickValue(value: number): void {
    const goal = this.goal();

    this.entrySaved.emit({ goalId: goal.goal_id, value, note: goal.note });
  }
}
