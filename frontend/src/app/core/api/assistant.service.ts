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

  notifyDataChanged(): void {
    this.refreshCounter.update((value) => value + 1);
  }

  sendMessage(request: AssistantChatRequest): Observable<AssistantChatResponse> {
    // return throwError(() => new Error('Simulated API error'));
    return this.http.post<AssistantChatResponse>(this.apiUrl, request);
  }
}
