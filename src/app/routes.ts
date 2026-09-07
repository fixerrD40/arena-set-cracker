import { Routes } from '@angular/router';
import { deckGuard } from './core/guards/deck.guard';
import { welcomeGuard } from './core/guards/welcome.guard';
import {
  deckWorkspaceGuard,
  legacyAddDeckRedirectGuard,
  legacyDeckRedirectGuard,
  createDeckOverlayRedirectGuard,
  setWorkspaceGuard
} from './core/guards/workspace.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [welcomeGuard],
    loadComponent: () => import('./features/index/index.component').then(m => m.IndexComponent)
  },
  {
    path: 'library',
    canActivate: [welcomeGuard],
    loadComponent: () => import('./features/library/library.component').then(m => m.LibraryComponent)
  },
  {
    path: 'about',
    loadComponent: () => import('./features/index/about/about.component').then(m => m.AboutComponent)
  },
  {
    path: 'welcome',
    canActivate: [welcomeGuard],
    loadComponent: () => import('./features/index/welcome/welcome.component').then(m => m.WelcomeComponent)
  },
  {
    path: 'login',
    loadComponent: () => import('./features/index/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./features/index/register/register.component').then(m => m.RegisterComponent)
  },
  {
    path: 'check-email',
    loadComponent: () =>
      import('./features/index/check-email/check-email.component').then((m) => m.CheckEmailComponent)
  },
  {
    path: 'verify-email',
    loadComponent: () =>
      import('./features/index/verify-email/verify-email.component').then((m) => m.VerifyEmailComponent)
  },
  {
    path: 'request-password-reset',
    loadComponent: () =>
      import('./features/index/request-password-reset/request-password-reset.component').then(
        (m) => m.RequestPasswordResetComponent
      )
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./features/index/reset-password/reset-password.component').then(
        (m) => m.ResetPasswordComponent
      )
  },
  {
    path: 'install-set',
    redirectTo: '/library?install=1',
    pathMatch: 'full'
  },
  {
    path: 'add-set',
    redirectTo: '/library?install=1',
    pathMatch: 'full'
  },
  {
    path: 'set/:id',
    canActivate: [welcomeGuard, setWorkspaceGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./features/set/set.component').then(m => m.SetComponent)
      },
      {
        path: 'add-deck',
        canActivate: [createDeckOverlayRedirectGuard],
        children: []
      },
      {
        path: 'deck/:deckId',
        canActivate: [deckWorkspaceGuard],
        canDeactivate: [deckGuard],
        loadComponent: () => import('./features/deck/deck.component').then(m => m.DeckComponent)
      }
    ]
  },
  {
    path: 'add-deck',
    canActivate: [welcomeGuard, legacyAddDeckRedirectGuard],
    children: []
  },
  {
    path: 'deck/:id',
    canActivate: [welcomeGuard, legacyDeckRedirectGuard],
    children: []
  },
  { path: '**', redirectTo: '' }
];
