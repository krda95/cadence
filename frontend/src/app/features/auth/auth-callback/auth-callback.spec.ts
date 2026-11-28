import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { AuthCallback } from './auth-callback';

describe('AuthCallback', () => {
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<AuthCallback>;

  const meUrl = `${environment.apiUrl}/me`;
  const tokens = '#access_token=access-1&refresh_token=refresh-1&expires_in=3600&token_type=bearer';

  async function create(hash: string): Promise<AuthCallback> {
    window.history.replaceState(null, '', `/auth/callback${hash}`);

    await TestBed.configureTestingModule({
      imports: [AuthCallback],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true) as never;

    fixture = TestBed.createComponent(AuthCallback);
    fixture.detectChanges();

    return fixture.componentInstance;
  }

  afterEach(() => {
    http.verify();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('stores the session, loads the profile and opens the dashboard', async () => {
    await create(tokens);

    http.expectOne(meUrl).flush({ id: '1', email: 'ada@gmail.com', has_password: false });

    expect(localStorage.getItem('access_token')).toBe('access-1');
    expect(localStorage.getItem('refresh_token')).toBe('refresh-1');
    expect(navigate).toHaveBeenCalledWith(['/dashboard'], { replaceUrl: true });
  });

  it('removes the tokens from the address bar right away', async () => {
    await create(tokens);

    expect(window.location.hash).toBe('');
    http.expectOne(meUrl).flush({ id: '1', email: 'ada@gmail.com', has_password: false });
  });

  it('explains a cancelled Google sign-in without calling the API', async () => {
    const component = await create('#error=access_denied&error_description=User+cancelled');

    expect(component.errorMessage()).toContain('cancelled');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('offers to try Google again right from the error', async () => {
    await create('#error=access_denied');

    const retry = (fixture.nativeElement as HTMLElement).querySelector('app-google-sign-in');

    expect(retry?.textContent).toContain('Continue with Google');
    expect(retry?.querySelector('.google-sign-in__divider')).toBeNull();
  });

  it('reads errors Supabase puts in the query string too', async () => {
    window.history.replaceState(null, '', '/auth/callback?error=server_error');
    const component = await create('');

    expect(component.errorMessage()).not.toBeNull();
  });

  it('signs back out when the profile cannot be loaded', async () => {
    const component = await create(tokens);

    http.expectOne(meUrl).flush(null, { status: 500, statusText: 'Server Error' });

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(component.errorMessage()).not.toBeNull();
  });
});
