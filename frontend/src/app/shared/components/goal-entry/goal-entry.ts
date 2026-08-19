import { Component, computed, input } from '@angular/core';
import { GoalEntryDayResponse } from '../../../models/goalModel';
import { Icon } from "@shared/ui/icon/icon";
import { LucidePencilLine, LucidePencil } from '@lucide/angular';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-goal-entry',
  templateUrl: './goal-entry.html',
  styleUrl: './goal-entry.scss',
  imports: [Icon, DecimalPipe, LucidePencilLine, LucidePencil],
})
export class GoalEntry {
  goal = input.required<GoalEntryDayResponse>();

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
}