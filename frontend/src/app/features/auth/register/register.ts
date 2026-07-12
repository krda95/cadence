import { Component, inject } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';

import { Button } from '@shared/ui/button/button';
import { InputComponent } from '@shared/ui/input/input';
import { LucideArrowLeft } from '@lucide/angular';

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

    console.log(this.registerForm.getRawValue());
  }
}