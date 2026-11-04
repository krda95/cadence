import { DatePipe } from '@angular/common';
import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';

@Component({
  selector: 'app-scroll-header',
  imports: [DatePipe],
  templateUrl: './scroll-header.html',
  styleUrl: './scroll-header.scss',
})
export class ScrollHeader {
  readonly title = input.required<string>();
  readonly date = input<string | Date | null>(null);
  readonly heading = input.required<HTMLElement>();

  readonly visible = signal(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') {
        return;
      }

      let observer: IntersectionObserver | undefined;
      let previousTop: number | undefined;

      const observe = () => {
        const top =
          parseFloat(
            getComputedStyle(this.host.nativeElement).getPropertyValue('--page-header-top'),
          ) || 0;

        if (top === previousTop) {
          return;
        }

        previousTop = top;
        observer?.disconnect();
        observer = new IntersectionObserver(
          ([entry]) => {
            // A heading below the viewport must not trigger the compact header.
            this.visible.set(!entry.isIntersecting && entry.boundingClientRect.bottom <= top);
          },
          { rootMargin: `-${top}px 0px 0px 0px`, threshold: 0 },
        );
        observer.observe(this.heading());
      };

      observe();
      window.addEventListener('resize', observe, { passive: true });
      this.destroyRef.onDestroy(() => {
        observer?.disconnect();
        window.removeEventListener('resize', observe);
      });
    });
  }
}
