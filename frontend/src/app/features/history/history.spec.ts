import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import moment from 'moment';
import { AssistantService } from '@core/api/assistant.service';

import { GoalEntryDayResponse } from '@models/goalModel';
import { DayProgressResponse } from '@models/progressModel';
import { History } from './history';

const GOAL: GoalEntryDayResponse = {
  goal_id: 'g1',
  name: 'Water',
  icon: null,
  color: null,
  unit: 'L',
  period: 'daily',
  target_type: 'min',
  quick_action_type: 'none',
  quick_action_step: null,
  target_value: 2,
  entry_value: 1,
  period_value: 1,
  note: null,
};

const yesterday = () => moment().subtract(1, 'd').format('YYYY-MM-DD');

const day = (score: number | null) =>
  ({ date: yesterday(), daily_score: score }) as unknown as DayProgressResponse;

describe('History', () => {
  let fixture: ComponentFixture<History>;
  let http: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const entries = () => http.expectOne((req) => req.url.endsWith('/entries'));
  const range = () => http.expectOne((req) => req.url.endsWith('/progress/range'));

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [History],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(History);
    fixture.detectChanges();
  });

  it('shows skeletons, not the empty state, while loading', () => {
    expect(el().querySelector('.history__skeleton')).toBeTruthy();
    expect(el().querySelector('.history__picker-skeleton')).toBeTruthy();
    expect(el().textContent).not.toContain('No historical entries');

    entries();
    range();
  });

  it('shows the empty state only after an empty response', async () => {
    entries().flush([]);
    range().flush([]);
    await settle();

    expect(el().textContent).toContain('No historical entries');
    expect(el().querySelector('.history__skeleton')).toBeNull();
  });

  it('gives the day arrows accessible names', async () => {
    entries().flush([GOAL]);
    range().flush([day(80)]);
    await settle();

    const labels = Array.from(el().querySelectorAll('app-button button')).map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(labels).toEqual(['Previous day', 'Next day']);
  });

  it('keeps a day scoring 0% in the picker', async () => {
    entries().flush([GOAL]);
    range().flush([day(0)]);
    await settle();

    expect(el().querySelectorAll('.history__header__bottom button').length).toBe(1);
    expect(el().querySelector('.history__score')?.textContent).toContain('Daily score 0%');
  });

  it('shows an error with retry when goals fail to load', async () => {
    entries().flush('boom', { status: 500, statusText: 'Server Error' });
    range().flush([day(80)]);
    await settle();

    const retry = el().querySelector<HTMLButtonElement>('.history__retry');
    expect(retry).toBeTruthy();

    retry!.click();
    fixture.detectChanges();
    entries().flush([GOAL]);
    await settle();

    expect(el().querySelector('.history__retry')).toBeNull();
    expect(el().querySelector('app-goal-entry')).toBeTruthy();
  });

  it('keeps the editor open and reports the error when saving fails', async () => {
    entries().flush([GOAL]);
    range().flush([day(80)]);
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

  it('slides the window with the selection so earlier days stay reachable', async () => {
    entries().flush([GOAL]);
    range().flush([day(80)]);
    await settle();

    const component = fixture.componentInstance;
    const before = component.dates()[0].getTime();

    component.selectDate(component.dates()[0]);
    fixture.detectChanges();

    expect(component.dates()[0].getTime()).toBeLessThan(before);
    entries();
    range();
  });

  it('keeps showing the previous scores while the next window loads', async () => {
    entries().flush([GOAL]);
    range().flush([day(80)]);
    await settle();

    const component = fixture.componentInstance;
    component.selectDate(component.dates()[5]);
    fixture.detectChanges();

    expect(component.rangeScore()).not.toBeNull();
    expect(el().querySelectorAll('.history__header__bottom button').length).toBeGreaterThan(0);

    entries();
    // The window end is unchanged, so scores are not requested again.
    http.expectNone((req) => req.url.endsWith('/progress/range'));
  });

  it('shows skeletons only for days waiting to arrive when the window slides', async () => {
    entries().flush([GOAL]);
    const component = fixture.componentInstance;
    const loadedDays = component
      .dates()
      .map((date) => ({ date: moment(date).format('YYYY-MM-DD'), daily_score: 80 }));
    range().flush(loadedDays);
    await settle();

    // Selecting an earlier visible day slides the window back by two days.
    component.selectDate(component.dates()[3]);
    fixture.detectChanges();

    const skeletons = el().querySelectorAll('.history__picker-skeleton').length;
    expect(skeletons).toBe(2);
    expect(el().querySelectorAll('.history__header__bottom button').length).toBe(10);

    entries().flush([GOAL]);
    range().flush(
      component
        .dates()
        .map((date) => ({ date: moment(date).format('YYYY-MM-DD'), daily_score: 70 })),
    );
    await settle();

    expect(el().querySelector('.history__picker-skeleton')).toBeNull();
    expect(el().querySelectorAll('.history__header__bottom button').length).toBe(12);
  });

  it('draws the selected day with a separate highlight so it can slide', async () => {
    entries().flush([GOAL]);
    range().flush([day(80)]);
    await settle();

    const pill = el().querySelector('.history__header__bottom .history__picker-pill');
    expect(pill).toBeTruthy();
    expect(pill?.getAttribute('aria-hidden')).toBe('true');
    expect(el().querySelector('.selectedDate')).toBeTruthy();
  });

  it('shows the bonus or penalty of a weekly goal on the selected day', async () => {
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
    range().flush([
      {
        ...day(95),
        components: [],
        periodic_progress: [{ goal_id: 'g2', daily_adjustment_pp: -5 }],
      } as unknown as DayProgressResponse,
    ]);
    await settle();

    expect(el().querySelector('.goal-entry__impact')?.textContent).toContain('Penalty');
  });

  it('reloads the selected day and the picker scores after an assistant save', async () => {
    entries().flush([GOAL]);
    range().flush([day(80)]);
    await settle();

    const component = fixture.componentInstance;
    const selected = component.dates()[8];
    component.selectDate(selected);
    fixture.detectChanges();
    entries().flush([GOAL]);
    await settle();

    TestBed.inject(AssistantService).notifyDataChanged([yesterday()]);
    fixture.detectChanges();

    expect(entries().request.params.get('date')).toBe(moment(selected).format('YYYY-MM-DD'));
    range();
    expect(component.selectedDate()).toEqual(selected);
  });

  it('does not reload when the assistant saved nothing', async () => {
    entries().flush([GOAL]);
    range().flush([day(80)]);
    await settle();

    TestBed.inject(AssistantService).notifyDataChanged([]);
    fixture.detectChanges();

    http.expectNone((req) => req.url.endsWith('/entries'));
    http.expectNone((req) => req.url.endsWith('/progress/range'));
  });
});
