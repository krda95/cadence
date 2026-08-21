import { Component, effect, input, signal } from '@angular/core';
import { buildLucideDataUri } from '@lucide/icons/build';

import { lucideDynamicIconImports } from '@lucide/icons/dynamic';

type IconName = keyof typeof lucideDynamicIconImports;

@Component({
  selector: 'app-icon',
  imports: [],
  templateUrl: './icon.html',
  styleUrl: './icon.scss',
})
export class Icon {
  readonly name = input<string | null>(null);
  readonly color = input<string | null>(null);
  readonly size = input(22);

  readonly src = signal<string | null>(null);

  constructor() {
    effect(() => {
      const name = this.name();
      const color = this.color();
      const size = this.size();

      void this.loadIcon(name, color, size);
    });
  }

  private async loadIcon(name: string | null, color: string | null, size: number): Promise<void> {
    if (!name || !(name in lucideDynamicIconImports)) {
      this.src.set(null);
      return;
    }

    const iconModule = await lucideDynamicIconImports[name as IconName]?.();

    if (!iconModule) {
      this.src.set(null);
      return;
    }

    const icon = iconModule.default ?? iconModule;

    this.src.set(
      buildLucideDataUri(icon, {
        size,
        strokeWidth: 1.8,
        color: color ?? 'currentColor',
      }),
    );
  }
}
