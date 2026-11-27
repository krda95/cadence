import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { environment } from '../../../../environments/environment';
import { ChangePassword } from './change-password';

describe('ChangePassword', () => {
  let fixture: ComponentFixture<ChangePassword>;
  let component: ChangePassword;
  let http: HttpTestingController;

  const url = `${environment.apiUrl}/auth/change-password`;

  function fillForm(confirm = 'new-password'): void {
    component.form.setValue({
      currentPassword: 'old-password',
      password: 'new-password',
      confirmPassword: confirm,
    });
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChangePassword],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ChangePassword);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('does not send anything when the new passwords differ', () => {
    fillForm('something-else');

    component.submit();

    http.expectNone(url);
    expect(component.form.controls.confirmPassword.hasError('passwordMismatch')).toBe(true);
  });

  it('sends current and new password, then clears the form and confirms', () => {
    fillForm();

    component.submit();

    const request = http.expectOne(url);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      current_password: 'old-password',
      new_password: 'new-password',
    });

    request.flush({ message: 'Password has been changed successfully' });

    expect(component.successMessage()).toBe('Your password has been changed.');
    expect(component.form.getRawValue().currentPassword).toBe('');
    expect(component.isSubmitting()).toBe(false);
  });

  it('explains a wrong current password without logging the user out', () => {
    fillForm();

    component.submit();
    http
      .expectOne(url)
      .flush(
        { detail: 'Current password is incorrect' },
        { status: 400, statusText: 'Bad Request' },
      );

    expect(component.errorMessage()).toBe('Your current password is incorrect.');
    expect(component.successMessage()).toBeNull();
  });

  it('shows a connection message when the server cannot be reached', () => {
    fillForm();

    component.submit();
    http.expectOne(url).error(new ProgressEvent('error'), { status: 0 });

    expect(component.errorMessage()).toContain("Can't reach Cadence");
  });
});
