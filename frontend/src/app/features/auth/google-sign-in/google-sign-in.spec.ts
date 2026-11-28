import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { AuthService } from '@core/services/auth.service';
import { GoogleSignIn } from './google-sign-in';

describe('GoogleSignIn', () => {
  let fixture: ComponentFixture<GoogleSignIn>;
  let start: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GoogleSignIn],
      providers: [provideHttpClient()],
    }).compileComponents();

    start = vi
      .spyOn(TestBed.inject(AuthService), 'startGoogleSignIn')
      .mockImplementation(() => {}) as never;
    fixture = TestBed.createComponent(GoogleSignIn);
    fixture.detectChanges();
  });

  it('hands off to the Google sign-in redirect when clicked', () => {
    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
    fixture.detectChanges();

    expect(start).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.redirecting()).toBe(true);
  });

  it('drops the spinner when the page is restored after going Back from Google', () => {
    fixture.componentInstance.start();

    // jsdom has no PageTransitionEvent constructor.
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));

    expect(fixture.componentInstance.redirecting()).toBe(false);
  });

  it('keeps the spinner on an ordinary page load', () => {
    fixture.componentInstance.start();

    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));

    expect(fixture.componentInstance.redirecting()).toBe(true);
  });
});
