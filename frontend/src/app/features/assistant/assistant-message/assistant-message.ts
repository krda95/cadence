import { Component, input } from '@angular/core';
import { AssistantMessage as Message } from '../models/assistant-message.model';

@Component({
  selector: 'app-assistant-message',
  templateUrl: './assistant-message.html',
  styleUrl: './assistant-message.scss',
})
export class AssistantMessage {
  readonly message = input.required<Message>();
}
