import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';

import { AuthService } from '@core/services/auth.service';
import { Button } from '@shared/ui/button/button';
import { InputComponent } from '@shared/ui/input/input';
import { MIN_PASSWORD_LENGTH, passwordsMatchValidator } from '@features/auth/register/register';

@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule, InputComponent, Button],
  templateUrl: './change-password.html',
  styleUrl: './change-password.scss',
})
export class ChangePassword {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  readonly minPasswordLength = MIN_PASSWORD_LENGTH;
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly form = this.formBuilder.nonNullable.group(
    {
      currentPassword: ['', Validators.required],
      password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
      confirmPassword: ['', Validators.required],
    },
    {
      validators: passwordsMatchValidator,
    },
  );

  constructor() {
    // The group validator only runs when its own value changes; re-check when the password does.
    this.form.controls.password.valueChanges.subscribe(() => {
      this.form.updateValueAndValidity({ emitEvent: false });
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const { currentPassword, password } = this.form.getRawValue();

    this.authService
      .changePassword({
        current_password: currentPassword,
        new_password: password,
      })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          this.form.reset();
          this.successMessage.set('Your password has been changed.');
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(this.describeError(error));
        },
      });
  }

  private describeError(error: HttpErrorResponse): string {
    if (error.status === 400) {
      return 'Your current password is incorrect.';
    }

    if (error.status === 0) {
      return "Can't reach Cadence. Check your connection and try again.";
    }

    return "Couldn't change your password. Please try again.";
  }
}
