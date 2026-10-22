import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideCheck, LucideChevronDown } from '@lucide/angular';

export interface ComboboxOption {
  value: string;
  label: string;
}

let nextId = 0;

@Component({
  selector: 'app-combobox',
  imports: [LucideCheck, LucideChevronDown],
  templateUrl: './combobox.html',
  styleUrl: './combobox.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: Combobox,
      multi: true,
    },
  ],
})
export class Combobox implements ControlValueAccessor {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly label = input.required<string>();
  readonly options = input.required<ComboboxOption[]>();
  readonly placeholder = input('');

  readonly inputId = `app-combobox-${nextId++}`;
  readonly listId = `${this.inputId}-list`;

  readonly value = signal('');
  readonly isOpen = signal(false);
  readonly isDisabled = signal(false);
  readonly activeIndex = signal(-1);
  readonly listPosition = signal<Record<string, string>>({});

  readonly filteredOptions = computed(() => {
    const query = this.value().trim().toLowerCase();

    if (!query) {
      return this.options();
    }

    return this.options().filter(
      (option) =>
        option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query),
    );
  });

  constructor() {
    // Scroll events don't bubble, so capture them to follow scrolling inside the modal body.
    const reposition = (event: Event) => {
      if (!this.isOpen()) return;

      const target = event.target;

      if (target instanceof Element && target.closest('.combobox__list')) {
        return;
      }

      this.updateListPosition();
    };

    // The on-screen keyboard resizes and pans the visual viewport without firing window events.
    const onViewportChange = () => this.isOpen() && this.updateListPosition();
    const viewport = window.visualViewport;

    window.addEventListener('scroll', reposition, true);
    viewport?.addEventListener('resize', onViewportChange);
    viewport?.addEventListener('scroll', onViewportChange);

    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('scroll', reposition, true);
      viewport?.removeEventListener('resize', onViewportChange);
      viewport?.removeEventListener('scroll', onViewportChange);
    });
  }

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

  setDisabledState(disabled: boolean): void {
    this.isDisabled.set(disabled);

    if (disabled) {
      this.isOpen.set(false);
    }
  }

  open(): void {
    if (this.isDisabled()) return;

    this.activeIndex.set(-1);
    this.updateListPosition();
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
    this.activeIndex.set(-1);
  }

  handleInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;

    this.value.set(value);
    this.onChange(value);

    this.activeIndex.set(-1);
    this.updateListPosition();
    this.isOpen.set(true);
  }

  select(option: ComboboxOption): void {
    this.value.set(option.value);
    this.onChange(option.value);

    this.close();
  }

  handleKeydown(event: KeyboardEvent): void {
    const count = this.filteredOptions().length;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();

        if (!this.isOpen()) {
          this.open();
          return;
        }

        if (count === 0) return;

        const step = event.key === 'ArrowDown' ? 1 : -1;

        this.activeIndex.update((index) => {
          if (index === -1) {
            return step === 1 ? 0 : count - 1;
          }

          return (index + step + count) % count;
        });

        break;
      }

      case 'Enter': {
        if (!this.isOpen()) return;

        const option = this.filteredOptions()[this.activeIndex()];

        if (option) {
          event.preventDefault();
          this.select(option);
        }

        break;
      }

      case 'Escape': {
        if (this.isOpen()) {
          event.preventDefault();
          event.stopPropagation();
          this.close();
        }

        break;
      }

      case 'Tab':
        this.close();
        break;
    }
  }

  // The fixed overlay escapes clipping ancestors such as the modal body.
  @HostListener('window:resize')
  updateListPosition(): void {
    const control = this.host.nativeElement.querySelector('.combobox__control');
    const overlay = this.host.nativeElement.querySelector('.combobox__overlay');

    if (!control || !overlay) return;

    const rect = control.getBoundingClientRect();
    const origin = overlay.getBoundingClientRect();
    const gap = 8;
    const maxHeight = 200;
    const estimatedOptionHeight = 44;
    const estimatedListPadding = 10;
    const desiredHeight = Math.min(
      maxHeight,
      this.filteredOptions().length * estimatedOptionHeight + estimatedListPadding,
    );

    // `fixed` and getBoundingClientRect() both use the layout viewport, while the part the user
    // can actually see (above the keyboard) is the visual viewport inside it.
    const viewport = window.visualViewport;
    const visibleTop = viewport?.offsetTop ?? 0;
    const visibleBottom = visibleTop + (viewport?.height ?? window.innerHeight);

    const below = Math.max(0, visibleBottom - rect.bottom - gap);
    const above = Math.max(0, rect.top - visibleTop - gap);

    const openUp = below < desiredHeight && above > below;

    // Measure the fixed origin rather than assuming it is (0, 0). Safari can move fixed
    // elements when the keyboard pans the viewport. Both rects must use the same coordinates.
    this.listPosition.set({
      left: `${rect.right - origin.left}px`,
      minWidth: `${rect.width}px`,
      ...(openUp
        ? {
            top: `${rect.top - gap - origin.top}px`,
            translate: '-100% -100%',
            maxHeight: `${Math.min(maxHeight, above)}px`,
          }
        : {
            top: `${rect.bottom + gap - origin.top}px`,
            translate: '-100% 0',
            maxHeight: `${Math.min(maxHeight, below)}px`,
          }),
    });
  }

  handleBlur(): void {
    queueMicrotask(() => {
      if (!this.host.nativeElement.contains(document.activeElement)) {
        this.close();
        this.onTouched();
      }
    });
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.close();
      this.onTouched();
    }
  }
}
