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

  readonly entryValue = signal<number | null>(null);
  readonly entryNote = signal('');

  readonly entrySaved = output<{
    goalId: string;
    value: number;
    note: string | null;
  }>();
  readonly editStarted = output<void>();
  readonly editCancelled = output<void>();

  private readonly actionButton = viewChild<ElementRef<HTMLButtonElement>>('actionButton');
  private readonly valueInput = viewChild<InputComponent>('valueInput');

  readonly isWeekly = computed(() => this.goal().period !== 'daily');

  readonly todayValue = computed(() => {
    const goal = this.goal();

    return goal.period === 'daily' ? (goal.entry_value ?? 0) : goal.period_value;
  });

  /** For non-daily goals: what was logged in the period before today. */
  readonly valueBeforeToday = computed(() => {
    const goal = this.goal();

    return goal.period === 'daily' ? 0 : goal.period_value - (goal.entry_value ?? 0);
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

  readonly canSave = computed(() => {
    const value = this.entryValue();

    return !this.isSaving() && value !== null && value >= this.valueBeforeToday();
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
    if (value === '') {
      this.entryValue.set(null);
      return;
    }

    const parsedValue = Number(value.replace(',', '.'));

    if (!Number.isNaN(parsedValue) && parsedValue >= 0) {
      this.entryValue.set(parsedValue);
    }
  }

  onEditorKeydown(event: KeyboardEvent): void {
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
    const enteredValue = this.entryValue();

    if (!this.canSave() || enteredValue === null) {
      return;
    }

    this.entrySaved.emit({
      goalId: this.goal().goal_id,
      value: enteredValue - this.valueBeforeToday(),
      note: this.entryNote().trim() || null,
    });
  }
}
