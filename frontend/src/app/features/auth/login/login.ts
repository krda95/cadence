import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Button } from '../../../shared/ui/button/button';
import { InputComponent } from '../../../shared/ui/input/input';
import { AuthService } from '@core/services/auth.service';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, Button, InputComponent],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly isSubmitting = signal(false);

  readonly loginForm = this.fb.nonNullable.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
  });

  login() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }
    this.isSubmitting.set(true);

    this.authService.login(this.loginForm.getRawValue())
    .pipe(
      finalize(() => {
        this.isSubmitting.set(false);
      }),
    )
    .subscribe({
      next: () => {
        this.router.navigate(['/dashboard'])
      },
      error: (error: HttpErrorResponse) => {
        console.error(error)
        if (error.status === 401) {
          this.loginForm.controls.password.setErrors({
            invalidCredentials: true,
          });
          return;
        }
        if (error.status === 0) {
          this.loginForm.setErrors({
            serverUnavailable: true,
          });
          return;
        }
        this.loginForm.setErrors({
          unknownError: true,
        });
      }
    });
  }
}
