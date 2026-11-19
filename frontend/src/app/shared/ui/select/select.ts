import {
  Component,
  ElementRef,
  HostListener,
  inject,
  input,
  OnDestroy,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideCheck, LucideChevronDown } from '@lucide/angular';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

let nextId = 0;

@Component({
  selector: 'app-select',
  imports: [LucideChevronDown, LucideCheck],
  templateUrl: './select.html',
  styleUrl: './select.scss',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: Select, multi: true }],
})
export class Select implements ControlValueAccessor, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly options = input.required<SelectOption[]>();
  readonly label = input.required<string>();

  readonly listId = `app-select-${nextId++}`;

  readonly value = signal<string | null>(null);
  readonly isOpen = signal(false);
  readonly isDisabled = signal(false);
  readonly activeIndex = signal(0);

  /** Viewport coordinates of the list, so it is not clipped by a scrolling parent (e.g. a modal). */
  readonly listPosition = signal<{
    top: number | null;
    bottom: number | null;
    left: number;
    width: number;
    /** Opens above the trigger, so the animation has to start from the bottom edge. */
    up: boolean;
  }>({ top: 0, bottom: null, left: 0, width: 0, up: false });

  // A fixed list does not follow its parent when it scrolls, so close it instead.
  // `capture: true` is needed because scroll events do not bubble up from elements.
  private readonly closeOnScroll = () => this.close();

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  get selectedLabel(): string {
    return this.options().find((option) => option.value === this.value())?.label ?? '';
  }

  writeValue(value: string | null): void {
    this.value.set(value);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.isDisabled.set(disabled);
  }

  toggle(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    if (this.isDisabled()) return;

    const selected = this.options().findIndex((option) => option.value === this.value());

    this.activeIndex.set(Math.max(selected, 0));
    this.placeList();
    window.addEventListener('scroll', this.closeOnScroll, true);
    this.isOpen.set(true);
  }

  private placeList(): void {
    const trigger = this.host.nativeElement.querySelector('.select__trigger') as HTMLElement;
    const rect = trigger.getBoundingClientRect();

    // Open upwards when there is no room below but more room above.
    const listHeight = this.options().length * 44 + 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const opensUp = spaceBelow < listHeight + 16 && rect.top > spaceBelow;

    this.listPosition.set({
      top: opensUp ? null : rect.bottom + 8,
      bottom: opensUp ? window.innerHeight - rect.top + 8 : null,
      left: rect.left,
      width: rect.width,
      up: opensUp,
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.closeOnScroll, true);
  }

  close(): void {
    window.removeEventListener('scroll', this.closeOnScroll, true);
    this.isOpen.set(false);
    this.onTouched();
  }

  select(option: SelectOption): void {
    this.value.set(option.value);
    this.onChange(option.value);
    this.close();
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.options().length;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();

        if (!this.isOpen()) {
          this.open();
          return;
        }

        const step = event.key === 'ArrowDown' ? 1 : -1;

        this.activeIndex.update((index) => (index + step + count) % count);
        break;
      }
      case 'Enter':
      case ' ':
        event.preventDefault();

        if (this.isOpen()) {
          this.select(this.options()[this.activeIndex()]);
        } else {
          this.open();
        }
        break;
      case 'Escape':
        // Only this dropdown should react, not a dialog it is sitting in.
        if (this.isOpen()) {
          event.preventDefault();
          event.stopPropagation();
          this.close();
        }
        break;
      case 'Tab':
        if (this.isOpen()) this.close();
        break;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }
}
