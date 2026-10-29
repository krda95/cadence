import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Logo } from '../../shared/ui/logo/logo';
import { Hero } from './hero/hero';
import { Experience } from './experience/experience';
import { Expertise } from './expertise/expertise';
import { AuthService } from '@core/services/auth.service';

@Component({
  selector: 'app-about',
  imports: [RouterLink, Logo, Hero, Experience, Expertise],
  templateUrl: './about.html',
  styleUrl: './about.scss',
})
export class About {
  private readonly authService = inject(AuthService);

  readonly cadenceRoute = this.authService.isLoggedIn() ? '/dashboard' : '/login';
}
