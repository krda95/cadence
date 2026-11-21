import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { DashboardResponse } from '@models/dashboardModel';
import { Dashboard } from './dashboard';
import { By } from '@angular/platform-browser';

import { AssistantService } from '@core/api/assistant.service';
import { ActivityChart } from './activity-chart/activity-chart';

const RESPONSE: DashboardResponse = {
  today: { score: 82, scored_components_count: 3, pending_components_count: 1, has_entries: true },
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
    data: [
      {
        date: '2026-11-02',
        score: 40,
        included_in_averages: true,
      },
    ],
  },
};

describe('Dashboard', () => {
  let fixture: ComponentFixture<Dashboard>;
  let http: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;

  // The dashboard and the activity chart both request /dashboard.
  const dashboardRequests = () => http.match((req) => req.url.endsWith('/dashboard'));

  // Answers the pending /dashboard requests and lets the page render. fixture.whenStable() is not
  // used: the activity chart keeps the zone busy, so it never resolves in this test setup.
  async function flushAllDashboardRequests(answer: (req: TestRequest) => void): Promise<void> {
    dashboardRequests().forEach(answer);
    fixture.detectChanges();

    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }

  // The chart renders only after the summary arrives, so its own request comes in a second round.
  async function loadDashboard(): Promise<void> {
    await flushAllDashboardRequests((req) => req.flush(RESPONSE));
    await flushAllDashboardRequests((req) => req.flush(RESPONSE));
  }

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

  it('shows the first-week message when no week has a score yet', async () => {
    await flushAllDashboardRequests((req) => req.flush(RESPONSE));

    const rings = el().querySelectorAll('.score-ring[role="img"]');
    expect(el().querySelector('.week-card')?.textContent).toContain('Your journey starts here');
    expect(rings[0].getAttribute('aria-label')).toContain('Today: 82%');
  });

  it('falls back to last week when this week has no score and pluralises the days', async () => {
    const withLastWeek: DashboardResponse = {
      ...RESPONSE,
      previous_week: { score: 70, days_count: 3 },
    };

    await flushAllDashboardRequests((req) => req.flush(withLastWeek));

    const rings = el().querySelectorAll('.score-ring[role="img"]');
    expect(rings[0].getAttribute('aria-label')).toContain('Last week: 70%');
    expect(el().querySelector('.week-card .stat__label')?.textContent?.trim()).toBe('days counted');
  });

  it('shows an error with retry that reloads the data', async () => {
    await flushAllDashboardRequests((req) =>
      req.flush('boom', { status: 500, statusText: 'Server Error' }),
    );

    const retry = el().querySelector<HTMLButtonElement>('.dashboard__retry');
    expect(retry).toBeTruthy();

    retry!.click();
    fixture.detectChanges();
    await flushAllDashboardRequests((req) => req.flush(RESPONSE));

    expect(el().querySelector('.dashboard__retry')).toBeNull();
    expect(el().querySelector('.today-card')).toBeTruthy();
  });

  it('reloads the summary and the chart on its current period after an assistant save', async () => {
    await loadDashboard();

    const chart = fixture.debugElement.query(By.directive(ActivityChart))
      .componentInstance as ActivityChart;
    chart.setPeriod('month');
    fixture.detectChanges();
    await flushAllDashboardRequests((req) =>
      req.flush({ ...RESPONSE, activity: { ...RESPONSE.activity, period: 'month' } }),
    );

    TestBed.inject(AssistantService).notifyDataChanged(['2026-11-03']);
    fixture.detectChanges();

    const periods = dashboardRequests()
      .map((req) => req.request.params.get('period'))
      .sort();
    expect(periods).toEqual(['month', 'week']);
  });

  it('does not reload when the assistant saved nothing', async () => {
    await loadDashboard();

    TestBed.inject(AssistantService).notifyDataChanged([]);
    fixture.detectChanges();

    expect(dashboardRequests()).toHaveLength(0);
  });
});
