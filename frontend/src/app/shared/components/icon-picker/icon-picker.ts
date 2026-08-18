import {
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import {
  ConnectedPosition,
  OverlayModule,
} from '@angular/cdk/overlay';

import { buildLucideDataUri } from '@lucide/icons/build';
import { lucideDynamicIconImports } from '@lucide/icons/dynamic';

type IconName = keyof typeof lucideDynamicIconImports;

interface IconOption {
  name: IconName;
  src: string;
}

@Component({
  selector: 'app-icon-picker',
  imports: [OverlayModule],
  templateUrl: './icon-picker.html',
  styleUrl: './icon-picker.scss',
})
export class IconPicker {
  value = input<string | null>(null);
  color = input<string>('#fff');
  valueChange = output<string>();

  readonly isOpen = signal(false);
  readonly search = signal('');
  readonly icons = signal<IconOption[]>([]);
  readonly selectedIconSrc = signal<string | null>(null);
  readonly isLoading = signal(false);

  readonly overlayPositions: ConnectedPosition[] = [
    {
      originX: 'end',
      originY: 'top',
      overlayX: 'start',
      overlayY: 'top',
      offsetX: 8,
    },
    {
      originX: 'start',
      originY: 'top',
      overlayX: 'end',
      overlayY: 'top',
      offsetX: -8,
    },
    {
      originX: 'start',
      originY: 'bottom',
      overlayX: 'start',
      overlayY: 'top',
      offsetY: 8,
    },
    {
      originX: 'start',
      originY: 'top',
      overlayX: 'start',
      overlayY: 'bottom',
      offsetY: -8,
    },
  ];

  private readonly iconNames = Object.keys(
    lucideDynamicIconImports,
  ) as IconName[];

  private readonly visibleLimit = 48;

  readonly filteredIconNames = computed(() => {
    const query = this.search().trim().toLowerCase();

    return this.iconNames
      .filter((name) => name.includes(query))
      .slice(0, this.visibleLimit);
  });

  constructor() {
    effect(() => {
      const value = this.value();
      const color = this.color();

      void this.loadSelectedIcon(value, color);
    });
  }

  toggle(): void {
    this.isOpen.update((value) => !value);

    if (this.isOpen()) {
      void this.loadVisibleIcons();
    }
  }

  close(): void {
    this.isOpen.set(false);
  }

  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.search.set(input.value);

    this.loadVisibleIcons();
  }

  async selectIcon(name: IconName): Promise<void> {
    this.valueChange.emit(name);
    this.close();
  }

  private async loadVisibleIcons(): Promise<void> {
    this.isLoading.set(true);

    try {
      const icons = await Promise.all(
        this.filteredIconNames().map(
          async (name): Promise<IconOption | null> => {
            const icon = (await lucideDynamicIconImports[name]?.())
              ?.default;

            if (!icon) {
              return null;
            }

            return {
              name,
              src: buildLucideDataUri(icon, {
                size: 20,
                strokeWidth: 1.8,
                color: this.color()
              }),
            };
          },
        ),
      );

      this.icons.set(
        icons.filter(
          (icon): icon is IconOption => icon !== null,
        ),
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadSelectedIcon(
    name: string | null,
    color: string
  ): Promise<void> {
    if (!name || !(name in lucideDynamicIconImports)) {
      this.selectedIconSrc.set(null);
      return;
    }

    const icon = (
      await lucideDynamicIconImports[name as IconName]?.()
    )?.default;

    if (!icon) {
      this.selectedIconSrc.set(null);
      return;
    }

    this.selectedIconSrc.set(
      buildLucideDataUri(icon, {
        size: 22,
        strokeWidth: 1.8,
        color: color,
      }),
    );
  }
}