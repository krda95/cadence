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
import { LucidePencil, LucidePencilLine } from '@lucide/angular';

import { GoalEntryDayResponse } from '@models/goalModel';
import { Button } from '@shared/ui/button/button';
import { Icon } from '@shared/ui/icon/icon';
import { InputComponent } from '@shared/ui/input/input';
import { DailyImpact } from '@shared/utils/daily-impact';

@Component({
  selector: 'app-goal-entry',
  templateUrl: './goal-entry.html',
  styleUrl: './goal-entry.scss',
  imports: [Icon, DecimalPipe, LucidePencilLine, LucidePencil, Button, InputComponent, FormsModule],
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

    return goal.period === 'daily' ? (goal.entry_value ?? 0) : goal.period_value;
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

    if (goal.target_type === 'min') {
      return Math.min((goal.period_value / goal.target_value) * 100, 100);
    }

    return goal.period_value / goal.target_value > 1 ? 0 : 100;
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
  }

  startEditing(): void {
    this.entryValidationError.set(null);
    this.entryValue.set(this.todayValue());
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
}
