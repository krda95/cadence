import { AssistantHistoryService } from './assistant-history.service';

describe('AssistantHistoryService suggestions', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it('shows the suggestions by default', () => {
    expect(new AssistantHistoryService().suggestionsHidden()).toBe(false);
  });

  it('hides the suggestions when they are dismissed', () => {
    const service = new AssistantHistoryService();

    service.hideSuggestions();

    expect(service.suggestionsHidden()).toBe(true);
  });

  it('remembers dismissed suggestions for the rest of the session', () => {
    new AssistantHistoryService().hideSuggestions();

    expect(new AssistantHistoryService().suggestionsHidden()).toBe(true);
  });
});
