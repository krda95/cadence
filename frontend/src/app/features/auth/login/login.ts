import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideEye, LucideEyeClosed } from '@lucide/angular';

@Component({
  selector: 'app-login',
  imports: [FormsModule, LucideEye, LucideEyeClosed],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  passwordVisible = false;
  email = '';
  password = '';

  togglePassword(): void {
    this.passwordVisible = !this.passwordVisible;
  }

  get isFormValid(): boolean {
    return this.email.trim() !== '' && this.password.trim() !== '';
  }

  get isPasswordValid(): boolean {
    return this.password.length > 0;
  }
}
