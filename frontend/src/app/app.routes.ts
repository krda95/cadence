import { Routes } from '@angular/router';

import { AuthLayout } from '@layout/auth-layout/auth-layout';
import { Login } from '@features/auth/login/login';
import { ForgotPassword } from '@features/auth/forgot-password/forgot-password';
import { Register } from '@features/auth/register/register';

export const routes: Routes = [
  {
    path: '',
    component: AuthLayout,
    children: [
      {
        path: '',
        redirectTo: 'login',
        pathMatch: 'full'
      },
      {
        path: 'login',
        component: Login
      },
      {
        path: 'forgot-password',
        component: ForgotPassword
      },
      {
        path: 'register',
        component: Register
      }
    ]
  }
];