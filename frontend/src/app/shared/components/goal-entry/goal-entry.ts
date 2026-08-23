import { Component, computed, input, output, signal } from '@angular/core';
import { GoalEntryDayResponse } from '../../../models/goalModel';
import { Icon } from '@shared/ui/icon/icon';
import { LucidePencilLine, LucidePencil } from '@lucide/angular';
import { DecimalPipe } from '@angular/common';
import { Button } from '@shared/ui/button/button';
import { InputComponent } from '@shared/ui/input/input';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-goal-entry',
  templateUrl: './goal-entry.html',
  styleUrl: './goal-entry.scss',
  imports: [Icon, DecimalPipe, LucidePencilLine, LucidePencil, Button, InputComponent, FormsModule],
})
export class GoalEntry {
  goal = input.required<GoalEntryDayResponse>();
  isEditing = input(false);

  entryValue = signal<number | null>(null);
  entryNote = signal('');

  entrySaved = output<{
    goalId: string;
    value: number;
    note: string | null;
  }>();
  editStarted = output<void>();
  editCancelled = output<void>();

  progressPercent = computed(() => {
    const goal = this.goal();

    if (goal.target_value <= 0) {
      return 0;
    }

    if (goal.target_type === 'min') {
      return Math.min((goal.period_value / goal.target_value) * 100, 100);
    }

    return goal.period_value / goal.target_value <= 1 ? 100 : 0;
  });

  startEditing(): void {
    this.entryValue.set(this.getTodayValue(this.goal()) ?? 0);
    this.entryNote.set(this.goal().note ?? '');
    this.editStarted.emit();
  }

  getTodayValue(goal: GoalEntryDayResponse): number | null {
    return goal.period === 'daily' ? (goal.entry_value ?? 0) : goal.period_value;
  }

  cancelEditing(): void {
    this.editCancelled.emit();
  }

  onValueInput(event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    console.log(value);

    this.entryValue.set(Number.isNaN(value) ? null : value);
  }

  save(): void {
    const enteredValue = this.entryValue();

    if (enteredValue === null || Number.isNaN(enteredValue) || enteredValue < 0) {
      return;
    }

    let valueToSave = enteredValue;

    if (this.goal().period !== 'daily') {
      const currentDayValue = this.goal().entry_value ?? 0;

      const periodValueBeforeToday = this.goal().period_value - currentDayValue;

      valueToSave = enteredValue - periodValueBeforeToday;

      if (valueToSave < 0) {
        return;
      }
    }

    this.entrySaved.emit({
      goalId: this.goal().goal_id,
      value: valueToSave,
      note: this.entryNote().trim() || null,
    });

    this.cancelEditing();
  }
}
