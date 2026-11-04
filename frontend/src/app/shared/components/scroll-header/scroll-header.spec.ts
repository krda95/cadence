import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ScrollHeader } from './scroll-header';

describe('ScrollHeader', () => {
  let fixture: ComponentFixture<ScrollHeader>;
  let callback: IntersectionObserverCallback;
  let options: IntersectionObserverInit | undefined;
  const observe = vi.fn();
  const disconnect = vi.fn();

  beforeEach(async () => {
    observe.mockClear();
    disconnect.mockClear();

    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(next: IntersectionObserverCallback, init: IntersectionObserverInit) {
          callback = next;
          options = init;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );

    await TestBed.configureTestingModule({ imports: [ScrollHeader] }).compileComponents();
    fixture = TestBed.createComponent(ScrollHeader);
    fixture.componentRef.setInput('title', 'History');
    fixture.componentRef.setInput('date', '2026-11-02');
    fixture.componentRef.setInput('heading', document.createElement('div'));
    fixture.nativeElement.style.setProperty('--page-header-top', '72px');
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    vi.unstubAllGlobals();
  });

  function reportHeading(isIntersecting: boolean, bottom: number): void {
    callback(
      [{ isIntersecting, boundingClientRect: { bottom } } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    fixture.detectChanges();
  }

  it('appears only after the heading passes above the mobile toolbar and hides on return', () => {
    expect(options?.rootMargin).toBe('-72px 0px 0px 0px');
    expect(observe).toHaveBeenCalledWith(fixture.componentInstance.heading());
    expect(fixture.componentInstance.visible()).toBe(false);

    reportHeading(false, 900);
    expect(fixture.componentInstance.visible()).toBe(false);

    reportHeading(false, 70);
    expect(fixture.nativeElement.querySelector('.scroll-header--visible')).toBeTruthy();

    reportHeading(true, 150);
    expect(fixture.nativeElement.querySelector('.scroll-header--visible')).toBeNull();
  });

  it('recalculates the threshold when switching to desktop and disconnects on destroy', () => {
    fixture.nativeElement.style.setProperty('--page-header-top', '0px');
    window.dispatchEvent(new Event('resize'));

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(options?.rootMargin).toBe('-0px 0px 0px 0px');

    fixture.destroy();
    expect(disconnect).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new Event('resize'));
    expect(observe).toHaveBeenCalledTimes(2);
  });

  it('updates the date when the selected history day changes', () => {
    fixture.componentRef.setInput('date', '2026-11-01');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.scroll-header__title').textContent).toBe(
      'History',
    );
    expect(fixture.nativeElement.querySelector('.scroll-header__date').textContent).toContain(
      'November 1',
    );
  });

  it('shows only the title when no date is supplied', () => {
    fixture.componentRef.setInput('title', 'Today');
    fixture.componentRef.setInput('date', null);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.scroll-header__title').textContent).toBe('Today');
    expect(fixture.nativeElement.querySelector('.scroll-header__date')).toBeNull();
  });
});
