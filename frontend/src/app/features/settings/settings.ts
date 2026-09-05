import { Component, computed, inject } from '@angular/core';
import { AuthService } from '@core/services/auth.service';
import { UserProfile } from '@models/loginModel';

@Component({
  selector: 'app-settings',
  imports: [],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  private readonly authService = inject(AuthService);
  readonly currentUser = this.authService.currentUser;
}
