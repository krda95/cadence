import { Routes } from '@angular/router';
import { AuthLayout } from '@layout/auth-layout/auth-layout';
import { Login } from '@features/auth/login/login';
import { ForgotPassword } from '@features/auth/forgot-password/forgot-password';
import { Register } from '@features/auth/register/register';
import { authGuard, guestGuard } from '@core/guards/auth.guard';
import { Dashboard } from '@features/dashboard/dashboard';
import { AppLayout } from '@layout/app-layout/app-layout';
import { ResetPassword } from '@features/auth/reset-password/reset-password';
import { Goals } from '@features/goals/goals';
import { GoalForm } from '@features/goals/goal-form/goal-form';
import { Settings } from '@features/settings/settings';
import { Today } from '@features/today/today';
import { History } from '@features/history/history';

export const routes: Routes = [
  {
    path: '',
    component: AuthLayout,
    children: [
      {
        path: '',
        redirectTo: 'login',
        pathMatch: 'full',
      },
      {
        path: 'login',
        component: Login,
        canActivate: [guestGuard],
      },
      {
        path: 'forgot-password',
        component: ForgotPassword,
        canActivate: [guestGuard],
      },
      {
        path: 'register',
        component: Register,
        canActivate: [guestGuard],
      },
      {
        path: 'reset-password',
        component: ResetPassword,
        canActivate: [guestGuard],
      },
    ],
  },
  {
    path: '',
    component: AppLayout,
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        component: Dashboard,
      },
      {
        path: 'today',
        component: Today,
      },
      {
        path: 'history',
        component: History,
      },
      {
        path: 'goals',
        component: Goals,
        children: [
          {
            path: 'new',
            component: GoalForm,
          },
          {
            path: ':id/edit',
            component: GoalForm,
          },
        ],
      },
      {
        path: 'settings',
        component: Settings,
      },
    ],
  },
];
