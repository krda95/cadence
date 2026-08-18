import { Component, computed, input } from '@angular/core';

export type StatusValue = 'ExportRequested' | 'Processing' | 'Active' | 'Failed' | 'NotConnected';

const STATUS_LABELS: Record<StatusValue, string> = {
  ExportRequested: 'Export requested',
  Processing: 'Processing',
  Active: 'Active',
  Failed: 'Failed',
  NotConnected: 'Not connected',
};

@Component({
  selector: 'app-status',
  imports: [],
  templateUrl: './status.html',
  styleUrl: './status.scss',
})
export class Status {
  readonly value = input.required<StatusValue>();
  readonly label = computed(() => STATUS_LABELS[this.value()]);
}
