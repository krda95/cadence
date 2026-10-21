import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { GoalsService } from '@core/api/goals.service';
import { GoalCreate, GoalPeriod, GoalTargetType } from '@models/goalModel';
import { IconPicker } from '@shared/components/icon-picker/icon-picker';
import { Button } from '@shared/ui/button/button';
import { InputComponent } from '@shared/ui/input/input';
import { Loader } from '@shared/ui/loader/loader';
import { Modal } from '@shared/ui/modal/modal';
import { Select, SelectOption } from '@shared/ui/select/select';
import type { GoalDeactivatedState } from '../goals';
import { Combobox, ComboboxOption } from '@shared/ui/combobox/combobox';

/** Like `required`, but a field containing only spaces does not count as filled in. */
function notBlank(control: AbstractControl): ValidationErrors | null {
  return String(control.value ?? '').trim() ? null : { required: true };
}

@Component({
  selector: 'app-goal-form',
  imports: [
    ReactiveFormsModule,
    IconPicker,
    Button,
    InputComponent,
    Loader,
    Modal,
    Select,
    Combobox,
  ],
  templateUrl: './goal-form.html',
  styleUrl: './goal-form.scss',
})
export class GoalForm implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly goalsService = inject(GoalsService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    name: ['', notBlank],
    icon: [''],
    color: ['#9EDBC6'],
    unit: ['', notBlank],
    period: ['daily' as GoalPeriod, Validators.required],
    target_type: ['min' as GoalTargetType, Validators.required],
    target_value: [0, [Validators.required, Validators.min(0)]],
    is_active: [true, Validators.required],
  });

  readonly targetTypeOptions: SelectOption<GoalTargetType>[] = [
    { value: 'min', label: 'At least' },
    { value: 'max', label: 'At most' },
  ];

  readonly unitOptions: ComboboxOption[] = [
    { value: 'km', label: 'Kilometers (km)' },
    { value: 'm', label: 'Meters (m)' },
    { value: 'steps', label: 'Steps' },
    { value: 'minutes', label: 'Minutes' },
    { value: 'hours', label: 'Hours' },
    { value: 'repetitions', label: 'Repetitions' },
    { value: 'kg', label: 'Kilograms (kg)' },
    { value: 'g', label: 'Grams (g)' },
    { value: 'kcal', label: 'Calories (kcal)' },
    { value: 'liters', label: 'Liters' },
    { value: 'ml', label: 'Milliliters (ml)' },
    { value: 'pages', label: 'Pages' },
    { value: 'times', label: 'Times' },
  ];

  readonly goalId = this.route.snapshot.paramMap.get('id');
  readonly isEditMode = !!this.goalId;

  /** True when the goal being edited is currently inactive, so it can be reactivated. */
  readonly isInactive = signal(false);
  private goalName = '';

  readonly isLoading = signal(this.isEditMode);
  readonly loadError = signal(false);
  readonly isSaving = signal(false);
  readonly submitError = signal<string | null>(null);

  /** Whatever opened the modal, so focus can go back to it. */
  private readonly opener = document.activeElement as HTMLElement | null;

  ngOnDestroy(): void {
    this.opener?.focus?.();
  }

  ngOnInit(): void {
    if (!this.goalId) {
      return;
    }

    this.goalsService.getGoal(this.goalId).subscribe({
      next: (goal) => {
        this.goalName = goal.name;
        this.isInactive.set(!goal.is_active);
        this.form.patchValue({
          name: goal.name,
          icon: goal.icon ?? '',
          color: goal.color ?? '#9EDBC6',
          unit: goal.unit,
          period: goal.period,
          target_type: goal.target_type,
          target_value: goal.target_value,
          is_active: goal.is_active,
        });
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Failed to load goal:', error);
        this.loadError.set(true);
        this.isLoading.set(false);
      },
    });
  }

  setIcon(icon: string): void {
    this.form.controls.icon.setValue(icon);
    this.form.controls.icon.markAsDirty();
  }

  /** Close from Escape, the backdrop, × or Discard. */
  requestClose(): void {
    // The icon picker and dropdowns are overlays of their own: Escape should only close those first.
    if (document.querySelector('.icon-picker__popover, .select__list')) {
      return;
    }

    if (this.isSaving()) {
      return;
    }

    this.close();
  }

  deactivate(): void {
    if (!this.goalId || this.isSaving()) {
      return;
    }

    this.isSaving.set(true);
    this.submitError.set(null);

    this.goalsService.deleteGoal(this.goalId).subscribe({
      next: () => {
        const state: GoalDeactivatedState = { id: this.goalId!, name: this.goalName };

        this.router.navigate(['/goals'], { state: { goalDeactivated: state } });
      },
      error: (error) => {
        console.error('Failed to deactivate goal:', error);
        this.isSaving.set(false);
        this.submitError.set("Couldn't deactivate this goal. Try again.");
      },
    });
  }

  submit(): void {
    if (this.isSaving()) {
      return;
    }

    if (this.form.invalid) {
      // Show every missing field at once instead of one per attempt. Trying to submit counts
      // as having engaged with the field, so the messages are allowed to appear.
      Object.values(this.form.controls).forEach((control) => {
        control.markAsDirty();
        control.markAsTouched();
        control.updateValueAndValidity();
      });
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

    const request$ =
      this.isEditMode && this.goalId
        ? this.goalsService.updateGoal(this.goalId, payload)
        : this.goalsService.createGoal(payload);

    this.isSaving.set(true);
    this.submitError.set(null);

    request$.subscribe({
      next: () => this.close(),
      error: (error) => {
        console.error('Failed to save goal:', error);
        this.isSaving.set(false);
        this.submitError.set(
          this.isEditMode
            ? "Couldn't save your changes. Try again."
            : "Couldn't add this goal. Try again.",
        );
      },
    });
  }

  close(): void {
    this.router.navigate(['/goals']);
  }
}
