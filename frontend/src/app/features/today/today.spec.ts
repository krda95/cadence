import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { DailyProgressResponse } from '@models/progressModel';
import { GoalEntryDayResponse } from '@models/goalModel';
import { Today } from './today';

const GOAL: GoalEntryDayResponse = {
  goal_id: 'g1',
  name: 'Water',
  icon: null,
  color: null,
  unit: 'L',
  period: 'daily',
  target_type: 'min',
  target_value: 2,
  entry_value: 1,
  period_value: 1,
  note: null,
};

const SCORE = {
  daily_score: 0,
  is_final: false,
  scored_components_count: 2,
  pending_components_count: 1,
  has_entries: true,
  included_in_averages: true,
  base_score: 0,
  weekly_adjustment_pp: 0,
} as DailyProgressResponse;

describe('Today', () => {
  let fixture: ComponentFixture<Today>;
  let http: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const entries = () => http.expectOne((req) => req.url.endsWith('/entries'));
  const daily = () => http.expectOne((req) => req.url.endsWith('/progress/daily'));

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Today],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Today);
    fixture.detectChanges();
  });

  it('shows a loading state instead of the empty state while goals load', () => {
    expect(el().querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(el().textContent).not.toContain('No active goals');

    entries();
    daily();
  });

  it('shows the empty state only after an empty response', async () => {
    entries().flush([]);
    daily().flush(SCORE);
    await settle();

    expect(el().textContent).toContain('No active goals');
  });

  it('renders a score of 0 as a real score, not a missing one', async () => {
    entries().flush([GOAL]);
    daily().flush(SCORE);
    await settle();

    const ring = el().querySelector('.today__ring');
    expect(ring?.getAttribute('aria-label')).toContain('0%');
    expect(ring?.getAttribute('aria-label')).toContain('Needs work');
    expect(el().querySelector('.today__summary')?.textContent).toContain('So far');
    expect(el().querySelector('app-goal-entry')).toBeTruthy();
  });

  it('shows an error with retry when goals fail to load', async () => {
    entries().flush('boom', { status: 500, statusText: 'Server Error' });
    daily().flush(SCORE);
    await settle();

    const retry = el().querySelector<HTMLButtonElement>('.today__retry');
    expect(retry).toBeTruthy();

    retry!.click();
    fixture.detectChanges();
    entries().flush([GOAL]);
    await settle();

    expect(el().querySelector('.today__retry')).toBeNull();
    expect(el().querySelector('app-goal-entry')).toBeTruthy();
  });

  it('keeps the editor open and shows an error when saving fails', async () => {
    entries().flush([GOAL]);
    daily().flush(SCORE);
    await settle();

    const component = fixture.componentInstance;
    component.startEditing('g1');
    component.saveEntry({ goalId: 'g1', value: 1.5, note: null });

    http
      .expectOne((req) => req.method === 'PUT')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();

    expect(component.editingGoalId()).toBe('g1');
    expect(component.saveError()).toBeTruthy();
    expect(component.savingGoalId()).toBeNull();
  });

  it('deletes an entry, closes the editor and reloads the day', async () => {
    entries().flush([GOAL]);
    daily().flush(SCORE);
    await settle();

    const component = fixture.componentInstance;
    component.startEditing('g1');
    component.deleteEntry({ goalId: 'g1' });

    http
      .expectOne((req) => req.method === 'DELETE')
      .flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(component.editingGoalId()).toBeNull();
    expect(component.savingGoalId()).toBeNull();

    entries().flush([{ ...GOAL, entry_value: null, period_value: 0 }]);
    daily().flush(SCORE);
    await settle();
  });

  it('keeps the editor open and shows an error when deleting fails', async () => {
    entries().flush([GOAL]);
    daily().flush(SCORE);
    await settle();

    const component = fixture.componentInstance;
    component.startEditing('g1');
    component.deleteEntry({ goalId: 'g1' });

    http
      .expectOne((req) => req.method === 'DELETE')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();

    expect(component.editingGoalId()).toBe('g1');
    expect(component.saveError()).toContain("Couldn't delete");
    expect(component.savingGoalId()).toBeNull();
  });

  it('passes the weekly bonus or penalty of a goal to its card', async () => {
    const weekly = {
      ...GOAL,
      goal_id: 'g2',
      name: 'Beer',
      period: 'weekly' as const,
      target_type: 'max' as const,
      target_value: 2,
      entry_value: 1,
      period_value: 1,
    };
    entries().flush([weekly]);
    daily().flush({
      ...SCORE,
      components: [],
      periodic_progress: [{ goal_id: 'g2', daily_adjustment_pp: -5 }],
    } as unknown as DailyProgressResponse);
    await settle();

    expect(el().querySelector('.goal-entry__impact')?.textContent).toContain('Penalty');
  });
});
