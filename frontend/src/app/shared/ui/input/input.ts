import {
  Component,
  computed,
  input,
  signal,
  forwardRef,
  Injector,
  OnInit,
  AfterViewInit,
  OnDestroy,
  inject,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { LucideEye, LucideEyeClosed } from '@lucide/angular';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, NgControl } from '@angular/forms';

@Component({
  selector: 'app-input',
  imports: [LucideEye, LucideEyeClosed],
  templateUrl: './input.html',
  styleUrl: './input.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputComponent),
      multi: true,
    },
  ],
})
export class InputComponent implements ControlValueAccessor, OnInit, AfterViewInit, OnDestroy {
  readonly label = input('');
  readonly placeholder = input('');
  readonly type = input<'text' | 'email' | 'password' | 'number'>('text');
  readonly autoFocus = input(false);
  readonly tabIndex = input<number>(0);
  readonly variant = input<'default' | 'filled' | 'entry'>('default');

  readonly value = signal<string | number>('');
  readonly disabled = signal(false);
  readonly passwordVisible = signal(false);
  private readonly validationMessage = signal<string | null>(null);
  private readonly suppressUntilBlur = signal(false);

  readonly min = input<number | null>(null);
  readonly max = input<number | null>(null);
  readonly step = input<number | null>(null);

  private readonly injector = inject(Injector);
  private ngControl: NgControl | null = null;
  private validationTimeout: ReturnType<typeof setTimeout> | null = null;

  @ViewChild('input')
  private input!: ElementRef<HTMLInputElement>;

  ngOnInit(): void {
    this.ngControl = this.injector.get(NgControl, null, { self: true });
  }

  ngAfterViewInit() {
    if (this.autoFocus()) {
      this.input.nativeElement.focus();
    }

    this.ngControl?.control?.statusChanges.subscribe(() => {
      const control = this.ngControl?.control;
      if (control?.touched) {
        this.scheduleValidationUpdate();
      }
    });
  }

  readonly inputType = computed(() => {
    return this.type() === 'password'
      ? this.passwordVisible()
        ? 'text'
        : 'password'
      : this.type();
  });

  private onChange: (value: string | number | null) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | number | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string | number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  handleInput(event: Event): void {
    const inputElement = event.target as HTMLInputElement;

    const value = this.type() === 'number' ? inputElement.valueAsNumber : inputElement.value;

    const normalizedValue = typeof value === 'number' && Number.isNaN(value) ? null : value;

    this.value.set(normalizedValue ?? '');
    this.onChange(normalizedValue);
    this.suppressUntilBlur.set(true);
  }

  handleBlur(): void {
    this.onTouched();
    this.suppressUntilBlur.set(false);
    this.scheduleValidationUpdate();
  }

  ngOnDestroy(): void {
    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout);
    }
  }

  private scheduleValidationUpdate(): void {
    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout);
    }

    this.validationTimeout = setTimeout(() => {
      this.validationMessage.set(this.getCurrentErrorMessage());
    }, 200);
  }

  togglePassword() {
    if (this.disabled()) {
      return;
    }
    this.passwordVisible.update((value) => !value);
  }

  hasError(): boolean {
    return !this.suppressUntilBlur() && this.validationMessage() !== null;
  }

  errorMessage(): string | null {
    return this.suppressUntilBlur() ? null : this.validationMessage();
  }

  private getCurrentErrorMessage(): string | null {
    const control = this.ngControl?.control;

    if (!control?.errors) {
      return null;
    }

    if (control.errors['required']) {
      return `${this.label() || 'This field'} is required.`;
    }

    if (control.errors['email']) {
      return 'Enter a valid email address.';
    }

    if (control.errors['minlength']) {
      const length = control.errors['minlength']['requiredLength'];

      return `Use at least ${length} characters.`;
    }

    if (control.errors['passwordMismatch']) {
      return 'Passwords do not match.';
    }

    if (control.hasError('invalidCredentials')) {
      return 'Incorrect email or password.';
    }

    if (control.hasError('serverUnavailable')) {
      return 'The server is unavailable.';
    }

    if (control.hasError('accountExists')) {
      return 'An account with this email already exists.';
    }

    if (control.hasError('unknownError')) {
      return 'An unknown error occurred. Please try again later.';
    }

    return 'The value is invalid.';
  }
}
