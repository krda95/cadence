import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { Button } from "@shared/ui/button/button";

@Component({
  selector: 'app-dashboard',
  imports: [Button],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  logout() {
    console.log('logout');
    
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
