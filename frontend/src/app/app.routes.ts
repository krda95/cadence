import { Routes } from '@angular/router';

import { AuthLayout } from '@layout/auth-layout/auth-layout';
import { Login } from '@features/auth/login/login';

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
      }
    ]
  }
];