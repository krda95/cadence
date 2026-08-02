import { Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgClass } from '@angular/common';
import { Button } from '@shared/ui/button/button';
import { InputComponent } from '@shared/ui/input/input';
import { LucideArrowLeft } from '@lucide/angular';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '@core/services/auth.service';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-forgot-password',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Button,
    InputComponent,
    LucideArrowLeft,
    NgClass,
  ],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPassword {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  readonly isSubmitting = signal(false);
  readonly emailSentMessage = signal<string | null>(null);

  readonly forgotPasswordForm = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  submit(): void {
    if (this.forgotPasswordForm.invalid) {
      this.forgotPasswordForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    const { email } = this.forgotPasswordForm.getRawValue();

    this.authService.forgotPassword({ email })
    .pipe(
      finalize(() => {
        this.isSubmitting.set(false);
      })
    )
    .subscribe({
      next: (message) => {
        this.emailSentMessage.set(message?.message);
        this.forgotPasswordForm.controls.email.disable();
      },
      error: (error: HttpErrorResponse) => {
        if (error.status === 429) {
          this.forgotPasswordForm.controls.email.setErrors({
            tooManyRequests: true,
          });
          return;
        }

        this.forgotPasswordForm.controls.email.setErrors({
          resetFailed: true,
        });
      }
    });
  }
}