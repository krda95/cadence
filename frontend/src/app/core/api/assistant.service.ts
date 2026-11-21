import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AssistantChatRequest,
  AssistantChatResponse,
} from '../../features/assistant/models/assistant-message.model';

@Injectable({
  providedIn: 'root',
})
export class AssistantService {
  private readonly http = inject(HttpClient);

  private readonly apiUrl = `${environment.apiUrl}/ai/chat`;

  private readonly refreshCounter = signal(0);

  readonly dataVersion = this.refreshCounter.asReadonly();

  notifyDataChanged(affectedDates: readonly string[]): void {
    if (affectedDates.length === 0) {
      return;
    }

    this.refreshCounter.update((value) => ++value);
  }

  sendMessage(request: AssistantChatRequest): Observable<AssistantChatResponse> {
    // return throwError(() => new Error('Simulated API error'));
    return this.http.post<AssistantChatResponse>(this.apiUrl, request);
  }
}
