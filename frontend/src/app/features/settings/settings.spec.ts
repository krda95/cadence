import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '@core/services/auth.service';
import { UserProfile } from '@models/loginModel';
import { Settings } from './settings';

describe('Settings', () => {
  let fixture: ComponentFixture<Settings>;
  let auth: AuthService;

  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Settings],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    auth = TestBed.inject(AuthService);
    fixture = TestBed.createComponent(Settings);
  });

  it('shows a skeleton instead of placeholder text until the profile is known', () => {
    fixture.detectChanges();

    expect(el().querySelector('.settings__skeleton')).toBeTruthy();
    expect(el().textContent).not.toContain('No email');
  });

  it("shows the user's name exactly as written", () => {
    auth.currentUser.set({
      display_name: 'ada van der Berg',
      email: 'ada@example.com',
      profileInitial: 'A',
    } as UserProfile);
    fixture.detectChanges();

    const name = el().querySelector('.profile__name');
    expect(name?.textContent?.trim()).toBe('ada van der Berg');
    expect(getComputedStyle(name!).textTransform).not.toBe('capitalize');
    expect(el().querySelector('.profile__email')?.textContent).toContain('ada@example.com');
  });

  it('lists the score bands from the shared thresholds', () => {
    fixture.detectChanges();

    const values = Array.from(
      el().querySelectorAll('[aria-labelledby="settings-thresholds"] .threshold__value'),
    ).map((node) => node.textContent?.trim());

    expect(values).toEqual(['91–100%', '76–90%', '61–75%', '0–60%']);
  });
});
