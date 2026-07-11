import { Component, computed, input, signal, forwardRef, Injector, OnInit, inject, ViewChild, ElementRef } from '@angular/core';
import { LucideEye, LucideEyeClosed } from '@lucide/angular';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, NgControl} from '@angular/forms';

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
    }
  ]
})
export class InputComponent implements ControlValueAccessor, OnInit {
  readonly label = input('');
  readonly placeholder = input('');
  readonly type = input<'text' | 'email' | 'password'>('text');
  readonly autoFocus = input(false);
  readonly tabIndex = input<number>(0);

  readonly value = signal('');
  readonly disabled = signal(false);
  readonly passwordVisible = signal(false);
  private readonly validationMessage = signal<string | null>(null);

  private readonly injector = inject(Injector);
  private ngControl: NgControl | null = null;

  @ViewChild('input')
  private input!: ElementRef<HTMLInputElement>;

  ngOnInit(): void {
    this.ngControl = this.injector.get(NgControl, null, { self: true });
  }

  ngAfterViewInit() {
    if (this.autoFocus()) {
        this.input.nativeElement.focus();
    }
  }

  readonly inputType = computed(() => {  
    return this.type() === 'password' ? (this.passwordVisible() ? 'text' : 'password') : this.type();
  });
  
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
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
    const value = inputElement.value;

    this.value.set(value);
    this.onChange(value);
    if(this.type() === 'password') {
      this.validationMessage.set(this.getCurrentErrorMessage());
    }
  }

  handleBlur(): void {
    this.onTouched();
    this.validationMessage.set(this.getCurrentErrorMessage());
  }

  togglePassword() {
    if (this.disabled()) {
      return;
    }
    this.passwordVisible.update(value => !value);
  }

  hasError(): boolean {
    return this.validationMessage() !== null;
  }

  errorMessage(): string | null {
    return this.validationMessage();
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

    return 'The value is invalid.';
  }
}