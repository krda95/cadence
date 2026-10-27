import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  LucideCalendarDays,
  LucideChevronUp,
  LucideHistory,
  LucideLayoutDashboard,
  LucideLogOut,
  LucideSettings,
  LucideTarget,
} from '@lucide/angular';

import { AuthService } from '@core/services/auth.service';
import { Logo } from '@shared/ui/logo/logo';
import { AssistantPanel } from '@features/assistant/assistant-panel/assistant-panel';
import { LucideBot } from '@lucide/angular';

@Component({
  selector: 'app-app-layout',
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
    AssistantPanel,
    LucideBot,
  ],
  templateUrl: './app-layout.html',
  styleUrl: './app-layout.scss',
})
export class AppLayout {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isUserMenuOpen = signal(false);
  readonly currentUser = this.authService.currentUser;

  private readonly userMenu = viewChild<ElementRef<HTMLElement>>('userMenu');
  private readonly userTrigger = viewChild<ElementRef<HTMLButtonElement>>('userTrigger');
  private readonly nav = viewChild<ElementRef<HTMLElement>>('nav');
  private readonly destroyRef = inject(DestroyRef);

  private pillX: number | null = null;

  readonly isAssistantOpen = signal(false);

  toggleAssistant(): void {
    this.isAssistantOpen.update((open) => !open);
  }

  closeAssistant(): void {
    this.isAssistantOpen.set(false);
  }

  constructor() {
    afterNextRender(() => {
      const nav = this.nav()?.nativeElement;

      this.movePill(false);

      // Layout changes (rotation, breakpoint switch) must not slide the highlight.
      if (nav && typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => this.movePill(false));
        observer.observe(nav);
        this.destroyRef.onDestroy(() => observer.disconnect());
      }

      const subscription = this.router.events.subscribe((event) => {
        if (event instanceof NavigationEnd) {
          // routerLinkActive updates its class after the navigation settles.
          requestAnimationFrame(() => this.movePill(true));
        }
      });
      this.destroyRef.onDestroy(() => subscription.unsubscribe());
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isUserMenuOpen()) {
      return;
    }

    if (!this.userMenu()?.nativeElement.contains(event.target as Node)) {
      this.isUserMenuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.isUserMenuOpen()) {
      return;
    }

    this.isUserMenuOpen.set(false);
    // Keep keyboard users where they were instead of dropping focus on the page.
    this.userTrigger()?.nativeElement.focus();
  }

  toggleUserMenu(): void {
    this.isUserMenuOpen.update((open) => !open);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  /** One highlight sits behind the active tab and slides to the new one, like a segmented control. */
  private movePill(animate: boolean): void {
    const nav = this.nav()?.nativeElement;
    const pill = nav?.querySelector<HTMLElement>('.sidebar__pill');
    const active = nav?.querySelector<HTMLElement>('.sidebar__link.active');

    if (!pill) {
      return;
    }

    if (!active) {
      pill.style.opacity = '0';
      this.pillX = null;
      return;
    }

    Object.assign(pill.style, {
      opacity: '1',
      left: `${active.offsetLeft}px`,
      top: `${active.offsetTop}px`,
      width: `${active.offsetWidth}px`,
      height: `${active.offsetHeight}px`,
    });

    const before = this.pillX;
    const after = active.offsetLeft;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (animate && before !== null && !reduceMotion && Math.abs(before - after) > 0.5) {
      pill.animate(
        [{ transform: `translateX(${before - after}px)` }, { transform: 'translateX(0)' }],
        { duration: 320, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
      );
    }

    this.pillX = after;
  }
}
