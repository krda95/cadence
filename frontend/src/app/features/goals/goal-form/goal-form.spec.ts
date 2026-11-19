import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';

import { GoalResponse } from '@models/goalModel';
import { GoalForm } from './goal-form';

const GOAL = {
  id: 'g1',
  name: 'Water',
  icon: null,
  color: '#9EDBC6',
  unit: 'L',
  period: 'daily',
  target_type: 'min',
  target_value: 2,
  is_active: true,
} as GoalResponse;

describe('GoalForm', () => {
  // jsdom has no <dialog> behaviour.
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });

  let fixture: ComponentFixture<GoalForm>;
  let component: GoalForm;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  const el = () => fixture.nativeElement as HTMLElement;

  async function setup(id: string | null): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [GoalForm],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => id } } },
        },
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(GoalForm);
    component = fixture.componentInstance;
    fixture.detectChanges();

    if (id) {
      http.expectOne((req) => req.url.endsWith(`/goals/${id}`)).flush(GOAL);
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  it('closes immediately, even with unsaved edits', async () => {
    await setup(null);
    component.form.controls.name.setValue('Read');
    component.form.controls.name.markAsDirty();

    component.requestClose();

    expect(navigate).toHaveBeenCalledWith(['/goals']);
  });

  it('shows every missing field instead of submitting an invalid form', async () => {
    await setup(null);

    component.submit();

    expect(component.form.controls.name.touched).toBe(true);
    expect(component.form.controls.unit.touched).toBe(true);
    http.expectNone((req) => req.method === 'POST');
  });

  it('keeps the form open and says so when saving fails', async () => {
    await setup(null);
    component.form.patchValue({ name: 'Read', unit: 'pages' });

    component.submit();
    expect(component.isSaving()).toBe(true);

    http
      .expectOne((req) => req.method === 'POST')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(component.isSaving()).toBe(false);
    expect(component.submitError()).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('accepts a comma as the decimal separator in the step', async () => {
    await setup(null);
    component.form.patchValue({ name: 'Read', unit: 'pages', quick_action_type: 'increment' });
    // The text input hands over what was typed, so the control holds a string at runtime.
    component.form.controls.quick_action_step.setValue('0,5' as unknown as number);

    expect(component.form.controls.quick_action_step.valid).toBe(true);

    component.submit();

    const request = http.expectOne((req) => req.method === 'POST');
    expect(request.request.body.quick_action_step).toBe(0.5);
    request.flush(GOAL);
  });

  it('accepts a comma as the decimal separator in the target value', async () => {
    await setup(null);
    component.form.patchValue({ name: 'Run', unit: 'km' });
    component.form.controls.target_value.setValue('2,5' as unknown as number);

    expect(component.form.controls.target_value.valid).toBe(true);

    component.submit();

    const request = http.expectOne((req) => req.method === 'POST');
    expect(request.request.body.target_value).toBe(2.5);
    request.flush(GOAL);
  });

  it('rejects a target value that is not a number or is negative', async () => {
    await setup(null);

    for (const typed of ['', 'abc', '-1']) {
      component.form.controls.target_value.setValue(typed as unknown as number);
      expect(component.form.controls.target_value.valid).toBe(false);
    }

    component.form.controls.target_value.setValue('0' as unknown as number);
    expect(component.form.controls.target_value.valid).toBe(true);
  });

  it('still rejects a step that is not a positive number', async () => {
    await setup(null);
    component.form.patchValue({ quick_action_type: 'increment' });

    for (const typed of ['', '0', '-1', 'abc']) {
      component.form.controls.quick_action_step.setValue(typed as unknown as number);
      expect(component.form.controls.quick_action_step.valid).toBe(false);
    }
  });

  it('deactivates and hands the goal to the list so it can offer undo', async () => {
    await setup('g1');

    component.deactivate();
    http.expectOne((req) => req.method === 'DELETE').flush(GOAL);

    expect(navigate).toHaveBeenCalledWith(['/goals'], {
      state: { goalDeactivated: { id: 'g1', name: 'Water' } },
    });
  });

  it('stays quiet about required fields until they are changed', async () => {
    await setup(null);

    const nameInput = el().querySelector<HTMLInputElement>('#goal-name input');
    nameInput!.focus();
    nameInput!.dispatchEvent(new Event('blur'));
    await new Promise((resolve) => setTimeout(resolve, 250));
    fixture.detectChanges();

    expect(el().querySelector('.error-message')).toBeNull();

    // Once the user has typed and cleared the field, the message is allowed to appear.
    nameInput!.value = 'a';
    nameInput!.dispatchEvent(new Event('input'));
    nameInput!.value = '';
    nameInput!.dispatchEvent(new Event('input'));
    nameInput!.dispatchEvent(new Event('blur'));
    await new Promise((resolve) => setTimeout(resolve, 250));
    fixture.detectChanges();

    expect(el().querySelector('.error-message')?.textContent).toContain('required');
  });

  it('shows the missing fields when submitting an untouched form', async () => {
    await setup(null);

    component.submit();
    await new Promise((resolve) => setTimeout(resolve, 250));
    fixture.detectChanges();

    expect(el().querySelectorAll('.error-message').length).toBeGreaterThan(0);
  });

  it('keeps the primary button disabled until the form is ready', async () => {
    await setup(null);

    const primary = () =>
      el().querySelector<HTMLButtonElement>(
        '.goal-form__primary-actions app-button[type="submit"] button',
      );

    expect(primary()?.disabled).toBe(true);

    component.form.patchValue({ name: '   ', unit: 'pages' });
    fixture.detectChanges();
    expect(primary()?.disabled).toBe(true);

    component.form.patchValue({ name: 'Read' });
    fixture.detectChanges();
    expect(primary()?.disabled).toBe(false);
  });
});
