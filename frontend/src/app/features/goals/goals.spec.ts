import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';

import { GoalResponse } from '@models/goalModel';
import { Goals } from './goals';

const goal = (overrides: Partial<GoalResponse>): GoalResponse => ({
  id: 'g1',
  owner_id: 'u1',
  name: 'Water',
  icon: null,
  color: null,
  unit: 'L',
  period: 'daily',
  position: 0,
  target_type: 'min',
  target_value: 2,
  quick_action_type: 'none',
  quick_action_step: null,
  is_active: true,
  created_at: '',
  updated_at: '',
  ...overrides,
});

describe('Goals', () => {
  let fixture: ComponentFixture<Goals>;
  let http: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const list = () => http.expectOne((req) => req.method === 'GET' && req.url.endsWith('/goals'));

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Goals],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Goals);
    fixture.detectChanges();
  });

  it('shows a skeleton, not the empty state, while loading', () => {
    expect(el().querySelector('.goals__skeleton')).toBeTruthy();
    expect(el().textContent).not.toContain('No goals');

    list();
  });

  it('shows the empty state only after an empty response', async () => {
    list().flush([]);
    await settle();

    expect(el().textContent).toContain('No goals');
    expect(el().querySelector('.goals__skeleton')).toBeNull();
  });

  it('shows an error with retry when loading fails', async () => {
    list().flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();

    const retry = el().querySelector<HTMLButtonElement>('.goals__retry');
    expect(retry).toBeTruthy();

    retry!.click();
    fixture.detectChanges();
    list().flush([goal({})]);
    await settle();

    expect(el().querySelector('.goals__retry')).toBeNull();
    expect(el().querySelectorAll('.goal-card').length).toBe(1);
  });

  it('filters by status and marks inactive goals when showing all', async () => {
    list().flush([goal({ id: 'a' }), goal({ id: 'b', name: 'Run', is_active: false })]);
    await settle();

    expect(el().querySelectorAll('.goal-card').length).toBe(1);

    fixture.componentInstance.setStatusFilter('all');
    fixture.detectChanges();

    expect(el().querySelectorAll('.goal-card').length).toBe(2);
    expect(el().querySelector('.goal-card--inactive')?.textContent).toContain('Inactive');
  });

  it('does not render monthly goals', async () => {
    list().flush([goal({ period: 'monthly' })]);
    await settle();

    expect(el().querySelectorAll('.goal-card').length).toBe(0);
  });

  it('reorders optimistically and reports a failed save', async () => {
    list().flush([goal({ id: 'a', position: 0 }), goal({ id: 'b', name: 'Run', position: 1 })]);
    await settle();

    const component = fixture.componentInstance;
    const section = component.sections()[0];

    component.onHandleKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }), section, 0);
    fixture.detectChanges();

    expect(component.sections()[0].goals.map((g) => g.id)).toEqual(['b', 'a']);

    http
      .expectOne((req) => req.method === 'PUT' && req.url.endsWith('/goals/order'))
      .flush('boom', { status: 500, statusText: 'Server Error' });
    // The reload is scheduled by an effect; its request is still pending, so don't wait for stable.
    fixture.detectChanges();
    list().flush([goal({ id: 'a', position: 0 }), goal({ id: 'b', name: 'Run', position: 1 })]);
    await settle();

    expect(component.reorderError()).toBeTruthy();
    expect(component.sections()[0].goals.map((g) => g.id)).toEqual(['a', 'b']);
  });

  it('offers undo after a goal was deactivated and restores it', async () => {
    list().flush([goal({ id: 'a' })]);
    await settle();

    history.replaceState({ goalDeactivated: { id: 'a', name: 'Water' } }, '');
    await TestBed.inject(Router).navigateByUrl('/');
    fixture.detectChanges();

    expect(el().querySelector('.goals__toast')?.textContent).toContain('Water deactivated');

    fixture.componentInstance.undoDeactivate();
    const patch = http.expectOne((req) => req.method === 'PATCH');
    expect(patch.request.body).toEqual({ is_active: true });
    patch.flush(goal({ id: 'a' }));
    fixture.detectChanges();
    list().flush([goal({ id: 'a' })]);
    await settle();

    expect(el().querySelector('.goals__toast')).toBeNull();
  });

  it('slides the selection highlight by index and keeps every option visible', async () => {
    list().flush([goal({ id: 'a' })]);
    await settle();

    const filter = el().querySelector<HTMLElement>('.goals__filter')!;
    const options = el().querySelectorAll('.goals__filter-option');

    expect(options.length).toBe(3);
    expect(filter.style.getPropertyValue('--index')).toBe('0');

    fixture.componentInstance.setStatusFilter('all');
    fixture.detectChanges();

    expect(filter.style.getPropertyValue('--index')).toBe('2');
    expect(options[2].getAttribute('aria-pressed')).toBe('true');
  });

  it('offers the filter as a menu that closes on choice and on Escape', async () => {
    list().flush([goal({ id: 'a' })]);
    await settle();

    const component = fixture.componentInstance;
    const trigger = el().querySelector<HTMLButtonElement>('.goals__filter-trigger')!;

    trigger.click();
    fixture.detectChanges();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(el().querySelectorAll('[role="menuitemradio"]').length).toBe(3);

    const items = el().querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    items[1].click();
    fixture.detectChanges();

    expect(component.statusFilter()).toBe('inactive');
    expect(component.isFilterMenuOpen()).toBe(false);

    component.toggleFilterMenu();
    component.onEscape();
    expect(component.isFilterMenuOpen()).toBe(false);
  });
});
