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

import { Button } from '@shared/ui/button/button';
import { InputComponent } from '@shared/ui/input/input';
import { LucideArrowLeft } from '@lucide/angular';
import { AuthService } from '@core/services/auth.service';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';

export const passwordsMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const passwordControl = control.get('password');
    const confirmPasswordControl = control.get('confirmPassword');

    if (!passwordControl || !confirmPasswordControl) {
      return null;
    }

    const password = passwordControl.value;
    const confirmPassword = confirmPasswordControl.value;

    if (password !== confirmPassword) {
      confirmPasswordControl.setErrors({ passwordMismatch: true });
    } else {
      confirmPasswordControl.setErrors(null);
    }
    return null;
  };

@Component({
  selector: 'app-register',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Button,
    InputComponent,
    LucideArrowLeft,
  ],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})

export class Register {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly isSubmitting = signal(false);
  
  readonly registerForm = this.formBuilder.nonNullable.group({
    username: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    confirmPassword: ['', Validators.required],
    },
    {
      validators: passwordsMatchValidator
    }
  );

  constructor() {
    this.registerForm.get('password')?.valueChanges.subscribe(() => {
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

    this.authService.register({ email, password, username})
    .pipe(
      finalize(() => {
        this.isSubmitting.set(false);
      })
    )
    .subscribe({
      next: () => {
        this.router.navigate(['/login'])
      },
      error: (error: HttpErrorResponse) => {
        console.error(error)
        if (error.status === 401) {
          this.registerForm.controls.password.setErrors({
            invalidCredentials: true,
          });
          return;
        }
        if (error.status === 422) {
          this.registerForm.controls.username.setErrors({
            accountExists: true,
          });
          return;
        }
        if (error.status === 0) {
          this.registerForm.controls.username.setErrors({
            serverUnavailable: true,
          });
          return;
        }
        this.registerForm.controls.username.setErrors({
          unknownError: true,
        });
      }
    });
  }
}