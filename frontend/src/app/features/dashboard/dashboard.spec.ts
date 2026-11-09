import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { DashboardResponse } from '@models/dashboardModel';
import { Dashboard } from './dashboard';

const RESPONSE: DashboardResponse = {
  today: { score: 82, scored_components_count: 3, pending_components_count: 1 },
  week: { score: null, days_count: 1 },
  previous_week: { score: null, days_count: 0 },
  streak: { current: 0, longest: 5 },
  activity: {
    period: 'week',
    offset: 0,
    date_from: '2026-11-02',
    date_to: '2026-11-08',
    min_offset: 0,
    max_offset: 3,
    data: [{ date: '2026-11-02', score: 40 }],
  },
};

describe('Dashboard', () => {
  let fixture: ComponentFixture<Dashboard>;
  let http: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;

  // The dashboard and the activity chart both request /dashboard.
  const dashboardRequests = () => http.match((req) => req.url.endsWith('/dashboard'));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
  });

  it('shows a loading state until the request resolves', () => {
    expect(el().querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(dashboardRequests().length).toBeGreaterThan(0);
  });

  it('renders scores, handles a null week score and pluralises', async () => {
    dashboardRequests().forEach((req) => req.flush(RESPONSE));
    await fixture.whenStable();
    fixture.detectChanges();

    const rings = el().querySelectorAll('.score-ring[role="img"]');
    expect(rings[0].getAttribute('aria-label')).toBe('This week: no score');
    expect(rings[1].getAttribute('aria-label')).toContain('Today: 82%');
    expect(el().querySelector('.week-card .stat__label')?.textContent?.trim()).toBe('day counted');
  });

  it('shows an error with retry that reloads the data', async () => {
    dashboardRequests().forEach((req) =>
      req.flush('boom', { status: 500, statusText: 'Server Error' }),
    );
    await fixture.whenStable();
    fixture.detectChanges();

    const retry = el().querySelector<HTMLButtonElement>('.dashboard__retry');
    expect(retry).toBeTruthy();

    retry!.click();
    fixture.detectChanges();
    dashboardRequests().forEach((req) => req.flush(RESPONSE));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el().querySelector('.dashboard__retry')).toBeNull();
    expect(el().querySelector('.today-card')).toBeTruthy();
  });
});
