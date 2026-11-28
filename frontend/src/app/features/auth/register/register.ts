import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideArrowLeft } from '@lucide/angular';
import { finalize } from 'rxjs';

import { AuthService } from '@core/services/auth.service';
import { Button } from '@shared/ui/button/button';
import { InputComponent } from '@shared/ui/input/input';
import { GoogleSignIn } from '../google-sign-in/google-sign-in';

export const MIN_PASSWORD_LENGTH = 8;

export const passwordsMatchValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const password = control.get('password');
  const confirmPassword = control.get('confirmPassword');

  if (!password || !confirmPassword) {
    return null;
  }

  const { passwordMismatch, ...otherErrors } = confirmPassword.errors ?? {};
  void passwordMismatch;

  const mismatch = !!confirmPassword.value && password.value !== confirmPassword.value;
  const errors = mismatch ? { ...otherErrors, passwordMismatch: true } : otherErrors;

  confirmPassword.setErrors(Object.keys(errors).length ? errors : null);

  return null;
};

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, Button, InputComponent, LucideArrowLeft, GoogleSignIn],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly minPasswordLength = MIN_PASSWORD_LENGTH;
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly registerForm = this.formBuilder.nonNullable.group(
    {
      username: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
      confirmPassword: ['', Validators.required],
    },
    {
      validators: passwordsMatchValidator,
    },
  );

  constructor() {
    // The group validator only runs when its own value changes; re-check when the password does.
    this.registerForm.controls.password.valueChanges.subscribe(() => {
      this.registerForm.updateValueAndValidity({ emitEvent: false });
    });
  }

  submit(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    const { email, password, username } = this.registerForm.getRawValue();

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    this.authService
      .register({ email, password, username })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          this.router.navigate(['/login'], { state: { registered: true, email } });
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(this.describe(error));
        },
      });
  }

  private describe(error: HttpErrorResponse): string {
    switch (error.status) {
      case 409:
      case 422:
        return 'An account with these details already exists. Try signing in instead.';
      case 429:
        return 'Too many attempts. Wait a moment and try again.';
      case 0:
        return "Can't reach Cadence. Check your connection and try again.";
      default:
        return 'Something went wrong. Please try again.';
    }
  }
}
