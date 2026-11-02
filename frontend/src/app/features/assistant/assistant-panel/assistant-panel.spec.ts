import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { AssistantService } from '../../../core/api/assistant.service';
import { AssistantPanel } from './assistant-panel';

describe('AssistantPanel sending messages', () => {
  let fixture: ComponentFixture<AssistantPanel>;
  let http: HttpTestingController;
  const scrollToDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');

  const el = () => fixture.nativeElement as HTMLElement;
  const sendButton = () => el().querySelector<HTMLButtonElement>('[aria-label="Send message"]')!;
  const chatRequest = () => http.expectOne((req) => req.url.endsWith('/ai/chat'));

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function typeMessage(content: string): Promise<void> {
    const input = el().querySelector('textarea')!;
    input.value = content;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  beforeEach(async () => {
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });

    await TestBed.configureTestingModule({
      imports: [AssistantPanel],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AssistantPanel);
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => {
    http.verify();
    fixture.destroy();
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (scrollToDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'scrollTo', scrollToDescriptor);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
    }
  });

  it('sends and receives messages over LAN HTTP without randomUUID', async () => {
    // Non-secure origins expose getRandomValues but not randomUUID.
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });

    await typeMessage('8500 steps');
    expect(sendButton().disabled).toBe(false);
    sendButton().click();

    const request = chatRequest();
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ message: '8500 steps', history: [] });
    expect(fixture.componentInstance.isLoading()).toBe(true);
    expect(fixture.componentInstance.draft()).toBe('');

    request.flush({ message: 'Logged 8500 steps.' });
    await settle();

    const messages = fixture.componentInstance.messages();
    expect(messages.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: 'user', content: '8500 steps' },
      { role: 'assistant', content: 'Logged 8500 steps.' },
    ]);
    expect(new Set(messages.map(({ id }) => id)).size).toBe(2);
    expect(el().textContent).toContain('Logged 8500 steps.');
    expect(fixture.componentInstance.isLoading()).toBe(false);
    expect(TestBed.inject(AssistantService).dataVersion()).toBe(1);

    await typeMessage('Read 20 min');
    sendButton().click();
    const followUp = chatRequest();
    expect(followUp.request.body.history).toEqual([
      { role: 'user', content: '8500 steps' },
      { role: 'assistant', content: 'Logged 8500 steps.' },
    ]);
    followUp.flush({ message: 'Logged reading.' });
    await settle();
    expect(new Set(fixture.componentInstance.messages().map(({ id }) => id)).size).toBe(4);
  });

  it('uses randomUUID when it is available', async () => {
    const uuid = vi.spyOn(crypto, 'randomUUID');

    await typeMessage('Read 20 min');
    sendButton().click();
    chatRequest().flush({ message: 'Logged reading.' });
    await settle();

    expect(uuid).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.isLoading()).toBe(false);
  });
});
