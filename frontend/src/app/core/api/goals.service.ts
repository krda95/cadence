import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  GoalCreate,
  GoalEntryDayResponse,
  GoalEntryResponse,
  GoalResponse,
  GoalUpdate,
} from '../../models/goalModel';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class GoalsService {
  private readonly http = inject(HttpClient);
  private readonly apiGoalsUrl = `${environment.apiUrl}/goals`;

  createGoal(goal: GoalCreate) {
    return this.http.post<GoalResponse>(this.apiGoalsUrl, goal);
  }

  getGoal(id: string): Observable<GoalResponse> {
    return this.http.get<GoalResponse>(`${this.apiGoalsUrl}/${id}`);
  }

  updateGoal(id: string, goal: GoalUpdate): Observable<GoalResponse> {
    return this.http.patch<GoalResponse>(`${this.apiGoalsUrl}/${id}`, goal);
  }

  getGoals(): Observable<GoalResponse[]> {
    return this.http.get<GoalResponse[]>(this.apiGoalsUrl);
  }

  deleteGoal(id: string): Observable<GoalResponse> {
    return this.http.delete<GoalResponse>(`${this.apiGoalsUrl}/${id}`);
  }

  getEntriesForDate(date: string): Observable<GoalEntryDayResponse[]> {
    return this.http.get<GoalEntryDayResponse[]>(`${this.apiGoalsUrl}/entries`, {
      params: { date },
    });
  }

  upsertEntry(
    goalId: string,
    date: string,
    payload: {
      value: number;
      note: string | null;
    },
  ): Observable<GoalEntryResponse> {
    return this.http.put<GoalEntryResponse>(
      `${this.apiGoalsUrl}/${goalId}/entries/${date}`,
      payload,
    );
  }
}
