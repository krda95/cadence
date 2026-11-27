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
  const el = () => fixture.nativeElement as HTMLElement;
  const toggle = () => el().querySelector<HTMLButtonElement>('.change-password__toggle')!;
  const panel = () => el().querySelector<HTMLElement>('.change-password__panel')!;

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

  it('starts collapsed, with the form out of reach', () => {
    expect(component.isOpen()).toBe(false);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(panel().hasAttribute('inert')).toBe(true);
  });

  it('expands when the row is tapped', () => {
    toggle().click();
    fixture.detectChanges();

    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(panel().hasAttribute('inert')).toBe(false);
  });

  it('forgets what was typed when collapsed', () => {
    component.open();
    fillForm();
    component.errorMessage.set('Your current password is incorrect.');

    component.close();

    expect(component.isOpen()).toBe(false);
    expect(component.form.getRawValue().currentPassword).toBe('');
    expect(component.errorMessage()).toBeNull();
  });

  it('shows no placeholder that could pass for a typed password', () => {
    const placeholders = Array.from(el().querySelectorAll('input')).map((input) =>
      input.getAttribute('placeholder'),
    );

    expect(placeholders.every((value) => !value)).toBe(true);
  });

  it('does not send anything when the new passwords differ', () => {
    component.open();
    fillForm('something-else');

    component.submit();

    http.expectNone(url);
    expect(component.form.controls.confirmPassword.hasError('passwordMismatch')).toBe(true);
  });

  it('sends current and new password, then collapses and confirms', () => {
    component.open();
    fillForm();

    component.submit();

    const request = http.expectOne(url);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      current_password: 'old-password',
      new_password: 'new-password',
    });

    request.flush({ message: 'Password has been changed successfully' });

    expect(component.isOpen()).toBe(false);
    expect(component.successMessage()).toBe('Your password has been changed.');
    expect(component.form.getRawValue().currentPassword).toBe('');
    expect(component.isSubmitting()).toBe(false);
  });

  it('clears the confirmation when the form is opened again', () => {
    component.successMessage.set('Your password has been changed.');

    component.open();

    expect(component.successMessage()).toBeNull();
  });

  it('explains a wrong current password and keeps the form open', () => {
    component.open();
    fillForm();

    component.submit();
    http
      .expectOne(url)
      .flush(
        { detail: 'Current password is incorrect' },
        { status: 400, statusText: 'Bad Request' },
      );

    expect(component.isOpen()).toBe(true);
    expect(component.errorMessage()).toBe('Your current password is incorrect.');
    expect(component.successMessage()).toBeNull();
  });

  it('shows a connection message when the server cannot be reached', () => {
    component.open();
    fillForm();

    component.submit();
    http.expectOne(url).error(new ProgressEvent('error'), { status: 0 });

    expect(component.errorMessage()).toContain("Can't reach Cadence");
  });
});
