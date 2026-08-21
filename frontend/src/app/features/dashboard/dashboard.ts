import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  signal,
  viewChild,
  AfterViewInit,
} from '@angular/core';
import { environment } from '../../../environments/environment';
import { Button } from '@shared/ui/button/button';
import { Status, StatusValue } from '@shared/ui/status/status';

@Component({
  selector: 'app-dashboard',
  imports: [Button, Status],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Dashboard implements AfterViewInit {
  readonly fastenPublicId = environment.fastenPublicId;

  readonly connectionStatus = signal<StatusValue>('NotConnected');

  private readonly fastenStitch = viewChild.required<ElementRef<HTMLElement>>('fastenStitch');

  ngAfterViewInit(): void {
    this.fastenStitch().nativeElement.addEventListener('eventBus', (event) => {
      const data = JSON.parse((event as CustomEvent).detail.data);
      console.log(data);
      this.updateStatusFromEvent(data);
    });
  }

  openFastenStitch(): void {
    this.connectionStatus.set('Processing');
    (this.fastenStitch().nativeElement as HTMLElement & { show: () => void }).show();
  }

  private updateStatusFromEvent(data: { event_type?: string }): void {
    switch (data.event_type) {
      case 'widget.complete':
        this.connectionStatus.set('Active');
        break;
      case 'widget.config_error':
        this.connectionStatus.set('Failed');
        break;
      case 'widget.close':
        if (this.connectionStatus() === 'Processing') {
          this.connectionStatus.set('NotConnected');
        }
        break;
    }
  }
}
