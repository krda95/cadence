import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { GoalsService } from '@core/api/goals.service';
import { GoalCreate, GoalPeriod, GoalResponse, GoalTargetType } from '@models/goalModel';
import { IconPicker } from '@shared/components/icon-picker/icon-picker';
import { Button } from "@shared/ui/button/button";

@Component({
  selector: 'app-goal-form',
  imports: [ReactiveFormsModule, IconPicker, Button],
  templateUrl: './goal-form.html',
  styleUrl: './goal-form.scss',
})
export class GoalForm implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly goalsService = inject(GoalsService);
  private readonly router = inject(Router);

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    icon: [''],
    color: ['#9EDBC6'],
    unit: ['', Validators.required],
    period: ['daily' as GoalPeriod, Validators.required],
    target_type: ['min' as GoalTargetType, Validators.required],
    target_value: [0, [Validators.required, Validators.min(0)]],
    is_active: [true, Validators.required]
  });

  goalId = this.route.snapshot.paramMap.get('id');
  isEditMode = !!this.goalId;
  canBeDeactivated = false;

  ngOnInit(): void {
    if (!this.goalId) {
      return;
    }

    this.goalsService.getGoal(this.goalId).subscribe({
      next: (goal) => {
        this.canBeDeactivated = !goal.is_active;
        this.form.patchValue({
          name: goal.name,
          icon: goal.icon ?? '',
          color: goal.color ?? '#9EDBC6',
          unit: goal.unit,
          period: goal.period,
          target_type: goal.target_type,
          target_value: goal.target_value,
          is_active: goal.is_active
        });
      },
      error: (error) => {
        console.error('Failed to load goal:', error);
      },
    });
  }

  delete(id: string): void {
    this.goalsService.deleteGoal(id).subscribe({
      next: (goal) => {
        console.log('Deleted', goal);
        this.close()
      }
    })
  }

  submit(): void {
    if (this.form.invalid) {
      return;
    }

    const value = this.form.getRawValue();
    const payload: GoalCreate = {
      name: value.name,
      icon: value.icon || null,
      color: value.color || null,
      unit: value.unit,
      period: value.period,
      target_type: value.target_type,
      target_value: value.target_value,
      is_active: value.is_active,
    };

    const request$ = this.isEditMode && this.goalId
      ? this.goalsService.updateGoal(this.goalId, payload)
      : this.goalsService.createGoal(payload);

    request$.subscribe({
      next: (goal) => {
        console.log(this.isEditMode ? 'Goal updated:' : 'Goal created:', goal);
        this.close();
      },
      error: (error) => {
        console.error('Failed to create goal:', error);
      },
    });
  }

  close() {
    this.router.navigate(['/goals']);
  }
}
