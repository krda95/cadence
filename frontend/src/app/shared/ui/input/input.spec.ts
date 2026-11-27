import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { InputComponent as Input } from './input';

describe('Input', () => {
  let component: Input;
  let fixture: ComponentFixture<Input>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Input],
    }).compileComponents();

    fixture = TestBed.createComponent(Input);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

@Component({
  imports: [Input, ReactiveFormsModule],
  template: `<app-input label="Password" hint="At least 8 characters." [formControl]="control" />`,
})
class HintHost {
  readonly control = new FormControl('', [Validators.minLength(8)]);
}

describe('Input hint', () => {
  let fixture: ComponentFixture<HintHost>;

  const el = () => fixture.nativeElement as HTMLElement;
  const field = () => el().querySelector('input')!;

  beforeEach(async () => {
    vi.useFakeTimers();

    await TestBed.configureTestingModule({
      imports: [HintHost],
    }).compileComponents();

    fixture = TestBed.createComponent(HintHost);
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('shows the hint under the field and describes the input with it', () => {
    const hint = el().querySelector('.hint-message');

    expect(hint?.textContent?.trim()).toBe('At least 8 characters.');
    expect(field().getAttribute('aria-describedby')).toBe(hint?.id);
  });

  it('gives the hint slot to the error once the field is invalid', () => {
    field().value = 'short';
    field().dispatchEvent(new Event('input'));
    field().dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(250);
    fixture.detectChanges();

    expect(el().querySelector('.hint-message')).toBeNull();
    expect(el().querySelector('.error-message')?.textContent).toContain('at least 8');
  });
});
