import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { StartupService } from '@core/services/startup.service';
import { WakeUp } from '@shared/ui/wake-up/wake-up';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, WakeUp],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly startupService = inject(StartupService);
}
