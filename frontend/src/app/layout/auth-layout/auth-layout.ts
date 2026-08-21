import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Logo } from '@shared/ui/logo/logo';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet, Logo],
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.scss',
})
export class AuthLayout {}
