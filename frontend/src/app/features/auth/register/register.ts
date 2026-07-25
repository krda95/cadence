import { Component, inject } from '@angular/core';
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

  passwordsMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
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
  
  readonly registerForm = this.formBuilder.nonNullable.group({
    username: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    confirmPassword: ['', Validators.required],
    },
    {
      validators: this.passwordsMatchValidator
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

    this.authService.register({ email, password, username}).subscribe({
      next: () => {
        this.router.navigate(['/login'])
      },
      error: (error: HttpErrorResponse) => {
        console.error(error)
        if (error.status === 401) {
          this.registerForm.controls.password.setErrors({
            invalidCredentials: true,
          });
          this.registerForm.controls.password.markAsTouched();
          return;
        }
        if (error.status === 0) {
          this.registerForm.setErrors({
            serverUnavailable: true,
          });
          return;
        }
        this.registerForm.setErrors({
          unknownError: true,
        });
      }
    });
  }
}