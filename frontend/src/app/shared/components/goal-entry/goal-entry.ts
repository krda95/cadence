import { Component, computed, input, signal } from '@angular/core';
import { GoalEntryDayResponse } from '../../../models/goalModel';
import { Icon } from "@shared/ui/icon/icon";
import { LucidePencilLine, LucidePencil } from '@lucide/angular';
import { DecimalPipe } from '@angular/common';
import { Button } from "@shared/ui/button/button";

@Component({
  selector: 'app-goal-entry',
  templateUrl: './goal-entry.html',
  styleUrl: './goal-entry.scss',
  imports: [Icon, DecimalPipe, LucidePencilLine, LucidePencil, Button],
})
export class GoalEntry {
  goal = input.required<GoalEntryDayResponse>();
  isEditing = signal(false);
  entryValue = signal<number | null>(null);
  entryNote = signal('');

  progressPercent = computed(() => {
    const goal = this.goal();

    if (goal.target_value <= 0) {
      return 0;
    }

    if (goal.target_type === 'min') {
      return Math.min(
        (goal.period_value / goal.target_value) * 100,
        100,
      );
    }

    return Math.min(
      (goal.period_value / goal.target_value) * 100,
      100,
    );
  });

  startEditing(): void {    
    this.entryValue.set(this.getTodayValue(this.goal()) ?? 0);
    this.entryNote.set(this.goal().note ?? '');
    this.isEditing.set(true);
  }

  private getTodayValue(goal: GoalEntryDayResponse): number | null {
    return goal.period === 'daily'
      ? goal.entry_value
      : goal.period_value;
  }

  cancelEditing(): void {
    this.isEditing.set(false);
  }

  save(): void {
    console.log(this.entryNote(), this.entryValue());
    this.cancelEditing();
  }
}