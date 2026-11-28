import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { AuthService } from '@core/services/auth.service';
import { environment } from '../../../../environments/environment';
import { GoogleSignIn } from './google-sign-in';

describe('GoogleSignIn', () => {
  let fixture: ComponentFixture<GoogleSignIn>;
  let component: GoogleSignIn;
  let http: HttpTestingController;
  let redirect: ReturnType<typeof vi.fn>;

  const healthUrl = new URL('/health', environment.apiUrl).href;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GoogleSignIn],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    redirect = vi
      .spyOn(TestBed.inject(AuthService), 'startGoogleSignIn')
      .mockImplementation(() => {}) as never;

    fixture = TestBed.createComponent(GoogleSignIn);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('wakes the API before handing off to the Google redirect', () => {
    el().querySelector('button')!.click();

    expect(component.redirecting()).toBe(true);
    expect(redirect).not.toHaveBeenCalled();

    http.expectOne(healthUrl).flush({ status: 'ok' });

    expect(redirect).toHaveBeenCalledOnce();
  });

  it('ignores a second tap while it is already on its way', () => {
    component.start();
    component.start();

    http.expectOne(healthUrl).flush({ status: 'ok' });

    expect(redirect).toHaveBeenCalledOnce();
  });

  it('stays on the page and explains when the API cannot be reached', () => {
    component.start();

    http.expectOne(healthUrl).error(new ProgressEvent('error'), { status: 0 });
    fixture.detectChanges();

    expect(redirect).not.toHaveBeenCalled();
    expect(component.redirecting()).toBe(false);
    expect(el().querySelector('[role="alert"]')?.textContent).toContain("Can't reach Cadence");
  });

  it('drops the spinner when the page is restored after going Back from Google', () => {
    component.redirecting.set(true);

    // jsdom has no PageTransitionEvent constructor.
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));

    expect(component.redirecting()).toBe(false);
  });

  it('keeps the spinner on an ordinary page load', () => {
    component.redirecting.set(true);

    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));

    expect(component.redirecting()).toBe(true);
  });

  it('can leave out the "or" divider', () => {
    fixture.componentRef.setInput('divider', false);
    fixture.detectChanges();

    expect(el().querySelector('.google-sign-in__divider')).toBeNull();
  });
});
