import { Component, inject, signal } from '@angular/core';

import { LucideChevronRight, LucidePencil } from '@lucide/angular';

import { AuthService } from '@core/services/auth.service';
import { scoreBandRanges } from '@shared/utils/score-band';

import { AvatarEditor } from './avatar-editor/avatar-editor';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-settings',
  imports: [AvatarEditor, LucideChevronRight, LucidePencil, RouterLink],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  readonly currentUser = inject(AuthService).currentUser;
  readonly thresholds = scoreBandRanges();

  readonly isAvatarEditorOpen = signal(false);

  // Remember which url finished (or failed) loading, so a new avatar starts from the
  // skeleton again without an effect resetting a flag.
  readonly loadedAvatarUrl = signal<string | null>(null);
  readonly failedAvatarUrl = signal<string | null>(null);

  /** The url to render, or null when there is none or it failed, so we fall back to the initial. */
  hasAvatarImage(url: string | null | undefined): string | null {
    return url && url !== this.failedAvatarUrl() ? url : null;
  }

  isAvatarLoaded(url: string): boolean {
    return this.loadedAvatarUrl() === url;
  }
}
