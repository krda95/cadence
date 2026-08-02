import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ValidationErrors,
  ValidatorFn,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { LucideArrowLeft } from '@lucide/angular';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { InputComponent } from "@shared/ui/input/input";
import { Button } from "@shared/ui/button/button";
import { passwordsMatchValidator } from '../register/register';


@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, InputComponent, Button, LucideArrowLeft, RouterLink],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly accessToken = this.getRecoveryAccessToken();

  isSubmitting = false;
  linkInvalid = this.accessToken ?? false;

  readonly resetPasswordForm =
    this.formBuilder.nonNullable.group(
      {
        password: [
          '',
          [
            Validators.required,
            Validators.minLength(8),
          ],
        ],
        confirmPassword: [
          '',
          Validators.required,
        ],
      },
      {
        validators: passwordsMatchValidator,
      },
    );
  
  navigateToForgotPassword(): void {
    this.router.navigate(['/forgot-password'], {
      replaceUrl: true,
    });
  }

  submit(): void {
    if (this.resetPasswordForm.invalid || !this.accessToken) {
      this.resetPasswordForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const { password } = this.resetPasswordForm.getRawValue();

    this.authService.resetPassword({
        access_token: this.accessToken,
        password
      })
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
        })
      )
      .subscribe({
        next: () => {
          this.router.navigate(['/login'], {
            replaceUrl: true,
          });
        },
        error: (error: HttpErrorResponse) => {
          if (error.status === 401) {
            this.linkInvalid = true;
            return;
          }

          this.resetPasswordForm.setErrors({
            resetFailed: true,
          });
        },
      });
  }

  private getRecoveryAccessToken(): string | null {
    const fragment = window.location.hash.substring(1);
    const parameters = new URLSearchParams(fragment);
    // const type = parameters.get('type');
    // const error = parameters.get('error');
    const accessToken = parameters.get('access_token');

    console.log(accessToken);

    return accessToken;
  }
}