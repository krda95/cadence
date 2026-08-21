import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Logo } from '@shared/ui/logo/logo';
import {
  LucideLayoutDashboard,
  LucideCalendarDays,
  LucideHistory,
  LucideTarget,
  LucideSettings,
  LucideLogOut,
  LucideChevronUp,
  LucideChevronDown,
} from '@lucide/angular';
import { AuthService } from '@core/services/auth.service';
import { UserProfile } from '@models/loginModel';

@Component({
  selector: 'app-app-layout',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    Logo,
    LucideLayoutDashboard,
    LucideCalendarDays,
    LucideHistory,
    LucideTarget,
    LucideSettings,
    LucideLogOut,
    LucideChevronUp,
    LucideChevronDown,
  ],
  templateUrl: './app-layout.html',
  styleUrl: './app-layout.scss',
})
export class AppLayout implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  isUserMenuOpen = false;
  currentUser: UserProfile | null = null;
  initials: string = '';

  @ViewChild('userMenu')
  private userMenu?: ElementRef<HTMLElement>;

  ngOnInit(): void {
    this.authService.getCurrentUser().subscribe({
      next: (user) => {
        this.currentUser = user;
        this.initials = user.display_name
          ? user.display_name.charAt(0).toUpperCase()
          : this.initials;
        this.changeDetectorRef.markForCheck();
      },
      error: () => {
        this.authService.logout();
        this.router.navigate(['/login']);
      },
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isUserMenuOpen) {
      return;
    }

    const target = event.target as Node;

    const clickedInside = this.userMenu?.nativeElement.contains(target);

    if (!clickedInside) {
      this.isUserMenuOpen = false;
    }
  }

  toggleUserMenu(): void {
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
