import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GoalEntryDayResponse } from '@models/goalModel';
import { GoalEntry, QUICK_ACTION_DELAY_MS } from './goal-entry';

const DAILY: GoalEntryDayResponse = {
  goal_id: 'g1',
  name: 'Water',
  icon: null,
  color: null,
  unit: 'L',
  period: 'daily',
  target_type: 'min',
  quick_action_type: 'none',
  quick_action_step: null,
  target_value: 2,
  entry_value: 1,
  period_value: 1,
  note: null,
};

// 3 logged before today, 2 today.
const WEEKLY: GoalEntryDayResponse = {
  ...DAILY,
  goal_id: 'g2',
  name: 'Running',
  unit: 'km',
  period: 'weekly',
  target_value: 20,
  entry_value: 2,
  period_value: 5,
};

// 10,000 steps logged today, step of 1,000, with a note.
const STEPS: GoalEntryDayResponse = {
  ...DAILY,
  goal_id: 'g3',
  name: 'Steps',
  unit: 'steps',
  target_value: 10_000,
  entry_value: 10_000,
  period_value: 10_000,
  note: 'evening walk',
  quick_action_type: 'increment',
  quick_action_step: 1_000,
};

const CHECK: GoalEntryDayResponse = {
  ...DAILY,
  goal_id: 'g4',
  name: 'Meditate',
  unit: 'minutes',
  target_value: 10,
  entry_value: null,
  period_value: 0,
  note: null,
  quick_action_type: 'check',
};

describe('GoalEntry', () => {
  let fixture: ComponentFixture<GoalEntry>;
  let component: GoalEntry;

  function render(goal: GoalEntryDayResponse, isEditing = false): void {
    fixture.componentRef.setInput('goal', goal);
    fixture.componentRef.setInput('isEditing', isEditing);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [GoalEntry] }).compileComponents();

    fixture = TestBed.createComponent(GoalEntry);
    component = fixture.componentInstance;
  });

  it('allows saving 0 so an entry can be corrected downwards', () => {
    render(DAILY, true);
    component.entryValue.set(0);

    expect(component.canSave()).toBe(true);
  });

  it('does not allow a weekly total below what was logged before today', () => {
    render(WEEKLY, true);

    component.entryValue.set(2);
    expect(component.canSave()).toBe(false);

    component.entryValue.set(3);
    expect(component.canSave()).toBe(true);
  });

  it("emits only today's contribution for weekly goals", () => {
    render(WEEKLY, true);
    const saved: { goalId: string; value: number; note: string | null }[] = [];
    component.entrySaved.subscribe((event) => saved.push(event));

    component.entryValue.set(7);
    component.entryNote.set('  felt good  ');
    component.save();

    expect(saved).toEqual([{ goalId: 'g2', value: 4, note: 'felt good' }]);
  });

  it('treats an empty input as a delete when an entry exists, and warns about the note', () => {
    render(DAILY, true);
    const deleted: { goalId: string }[] = [];
    const saved: unknown[] = [];
    component.entryDeleted.subscribe((event) => deleted.push(event));
    component.entrySaved.subscribe((event) => saved.push(event));

    component.onEntryValueChange('');
    fixture.detectChanges();

    expect(component.isDeleting()).toBe(true);
    expect(component.canSave()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "delete today's entry, including its note",
    );

    component.save();

    expect(deleted).toEqual([{ goalId: 'g1' }]);
    expect(saved).toEqual([]);
  });

  it('deletes a weekly entry even though the total would drop below the earlier days', () => {
    render(WEEKLY, true);
    const deleted: { goalId: string }[] = [];
    component.entryDeleted.subscribe((event) => deleted.push(event));

    component.onEntryValueChange('');
    component.save();

    expect(deleted).toEqual([{ goalId: 'g2' }]);
  });

  it('does not offer a delete when there is no entry to remove', () => {
    render({ ...DAILY, entry_value: null, period_value: 0 }, true);

    component.onEntryValueChange('');
    fixture.detectChanges();

    expect(component.isDeleting()).toBe(false);
    expect(component.canSave()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('including its note');
  });

  it('does not treat invalid text as a delete', () => {
    render(DAILY, true);

    component.onEntryValueChange('abc');

    expect(component.isDeleting()).toBe(false);
    expect(component.canSave()).toBe(false);
  });

  describe('daily impact tag', () => {
    const tag = () =>
      (fixture.nativeElement as HTMLElement)
        .querySelector('.goal-entry__impact')
        ?.textContent?.trim();

    function renderWeekly(
      goal: GoalEntryDayResponse,
      impact: { adjustmentPp: number; countedScore: number | null } | null,
    ): void {
      fixture.componentRef.setInput('dailyImpact', impact);
      render(goal);
    }

    it('shows a bonus for a weekly minimum below its target', () => {
      renderWeekly(WEEKLY, { adjustmentPp: 5, countedScore: null });
      expect(tag()).toBe('Bonus');
    });

    it('shows a penalty for a weekly maximum that is still within its limit', () => {
      renderWeekly({ ...WEEKLY, target_type: 'max' }, { adjustmentPp: -5, countedScore: null });
      expect(tag()).toBe('Penalty');
    });

    it('shows that a crossed threshold counts in the average', () => {
      renderWeekly({ ...WEEKLY, target_type: 'max' }, { adjustmentPp: 0, countedScore: 0 });
      expect(tag()).toBe('Breached');

      renderWeekly(WEEKLY, { adjustmentPp: 0, countedScore: 100 });
      expect(tag()).toBe('Reached');
    });

    it('shows nothing without an entry today or for daily goals', () => {
      renderWeekly(
        { ...WEEKLY, entry_value: null, period_value: 3 },
        {
          adjustmentPp: 5,
          countedScore: null,
        },
      );
      expect(tag()).toBeUndefined();

      renderWeekly(DAILY, { adjustmentPp: 5, countedScore: null });
      expect(tag()).toBeUndefined();

      renderWeekly(WEEKLY, null);
      expect(tag()).toBeUndefined();
    });
  });

  describe('quick actions', () => {
    const root = () => fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      root().querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;

    function collectSaves(): { goalId: string; value: number; note: string | null }[] {
      const saved: { goalId: string; value: number; note: string | null }[] = [];
      component.entrySaved.subscribe((event) => saved.push(event));
      return saved;
    }
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    function clickAndSettle(label: string): void {
      button(label).click();
      vi.advanceTimersByTime(QUICK_ACTION_DELAY_MS);
    }

    it('adds one step and keeps the note, even above the target', () => {
      render(STEPS);
      const saved = collectSaves();

      clickAndSettle('Increase Steps');

      expect(saved).toEqual([{ goalId: 'g3', value: 11_000, note: 'evening walk' }]);
    });

    it('saves one step from an empty entry', () => {
      render({ ...STEPS, entry_value: null, period_value: 0, note: null });
      const saved = collectSaves();

      clickAndSettle('Increase Steps');

      expect(saved).toEqual([{ goalId: 'g3', value: 1_000, note: null }]);
    });

    it('disables decrease when the entry is empty or zero', () => {
      render({ ...STEPS, entry_value: null });
      expect(button('Decrease Steps').disabled).toBe(true);

      render({ ...STEPS, entry_value: 0 });
      expect(button('Decrease Steps').disabled).toBe(true);

      render(STEPS);
      expect(button('Decrease Steps').disabled).toBe(false);
    });

    it('never decreases below zero', () => {
      render({ ...STEPS, entry_value: 400 });
      const saved = collectSaves();

      clickAndSettle('Decrease Steps');

      expect(saved[0].value).toBe(0);
    });

    it('does not leak floating-point noise into fractional steps', () => {
      render({ ...STEPS, entry_value: 0.2, quick_action_step: 0.1 });
      const saved = collectSaves();

      clickAndSettle('Increase Steps');

      expect(saved[0].value).toBe(0.3);
    });

    it("changes today's entry for weekly goals, not the weekly total", () => {
      // Entry today is 2, the week so far is 5.
      render({ ...WEEKLY, quick_action_type: 'increment', quick_action_step: 1 });
      const saved = collectSaves();

      clickAndSettle('Increase Running');

      expect(saved[0].value).toBe(3);
    });

    it('derives the checkbox from the saved value', () => {
      const checked = () => button('Meditate completed').getAttribute('aria-checked');

      render(CHECK);
      expect(checked()).toBe('false');

      render({ ...CHECK, entry_value: 4 });
      expect(checked()).toBe('false');

      render({ ...CHECK, entry_value: 10 });
      expect(checked()).toBe('true');

      // A manual edit above the target still counts as done.
      render({ ...CHECK, entry_value: 25 });
      expect(checked()).toBe('true');
    });

    it('saves the target when switched on, keeping the note', () => {
      render({ ...CHECK, note: 'felt calm' });
      const saved = collectSaves();

      clickAndSettle('Meditate completed');

      expect(saved).toEqual([{ goalId: 'g4', value: 10, note: 'felt calm' }]);
    });

    it('saves an explicit 0 when switched off, also above the target, and never deletes', () => {
      render({ ...CHECK, entry_value: 25 });
      const saved = collectSaves();
      const deleted = vi.fn();
      component.entryDeleted.subscribe(deleted);

      clickAndSettle('Meditate completed');

      expect(saved).toEqual([{ goalId: 'g4', value: 0, note: null }]);
      expect(deleted).not.toHaveBeenCalled();
    });

    it('renders no quick controls when disabled or while the editor is open', () => {
      render(DAILY);
      expect(root().querySelector('.goal-entry__quick')).toBeNull();

      render(STEPS, true);
      expect(root().querySelector('.goal-entry__quick')).toBeNull();
    });

    it('ignores quick actions while a save is in flight', () => {
      render(STEPS);
      fixture.componentRef.setInput('isSaving', true);
      fixture.detectChanges();
      const saved = collectSaves();

      expect(button('Increase Steps').disabled).toBe(true);

      component.increment();
      component.decrement();
      component.toggleCheck();

      expect(saved).toEqual([]);
    });

    it('shows a save error outside the editor', () => {
      render(STEPS);
      fixture.componentRef.setInput('saveError', "Couldn't save your entry. Try again.");
      fixture.detectChanges();

      expect(root().querySelector('[role="alert"]')?.textContent).toContain("Couldn't save");
    });

    const current = () => root().querySelector('.goal-entry__current')?.textContent?.trim();

    it('combines rapid clicks into one save after the pause', () => {
      render(STEPS);
      const saved = collectSaves();

      for (let i = 0; i < 4; i++) {
        button('Increase Steps').click();
        vi.advanceTimersByTime(100);
      }

      // 100 ms after the last click, the pause has not passed yet.
      expect(saved).toEqual([]);

      vi.advanceTimersByTime(QUICK_ACTION_DELAY_MS);

      expect(saved).toEqual([{ goalId: 'g3', value: 14_000, note: 'evening walk' }]);
    });

    it('shows the new value at once, before anything is saved', () => {
      render(STEPS);
      const saved = collectSaves();

      button('Increase Steps').click();
      fixture.detectChanges();

      expect(current()).toBe('11,000');
      expect(saved).toEqual([]);
    });

    it('shows the weekly total with the pending change, leaving earlier days alone', () => {
      // Entry today is 2, earlier days 3, week total 5.
      render({ ...WEEKLY, quick_action_type: 'increment', quick_action_step: 1 });

      button('Increase Running').click();
      fixture.detectChanges();

      expect(current()).toBe('6');
      expect(root().textContent).toContain('Earlier this week: 3 km');
    });

    it('does not save clicks that cancel out', () => {
      render(STEPS);
      const saved = collectSaves();

      button('Increase Steps').click();
      button('Decrease Steps').click();
      vi.advanceTimersByTime(QUICK_ACTION_DELAY_MS);

      expect(saved).toEqual([]);
    });

    it('does not create an entry when clicks from an empty day cancel out', () => {
      render({ ...STEPS, entry_value: null, period_value: 0, note: null });
      const saved = collectSaves();

      button('Increase Steps').click();
      fixture.detectChanges(); // enables the decrease button
      button('Decrease Steps').click();
      vi.advanceTimersByTime(QUICK_ACTION_DELAY_MS);

      expect(saved).toEqual([]);
    });

    it('rolls back to the stored value when the save fails', () => {
      render(STEPS);

      button('Increase Steps').click();
      vi.advanceTimersByTime(QUICK_ACTION_DELAY_MS);
      fixture.detectChanges();
      expect(current()).toBe('11,000');

      fixture.componentRef.setInput('saveError', "Couldn't save your entry. Try again.");
      fixture.detectChanges();

      expect(current()).toBe('10,000');
    });

    it('saves unsaved clicks when the card is destroyed', () => {
      render(STEPS);
      const saved = collectSaves();

      button('Increase Steps').click();
      fixture.destroy();

      expect(saved).toEqual([{ goalId: 'g3', value: 11_000, note: 'evening walk' }]);
    });

    it('hands unsaved clicks to the editor instead of saving them in the background', () => {
      render(STEPS);
      const saved = collectSaves();

      button('Increase Steps').click();
      component.startEditing();
      vi.advanceTimersByTime(QUICK_ACTION_DELAY_MS);

      expect(component.entryValue()).toBe(11_000);
      expect(saved).toEqual([]);
    });
  });

  it('uses the same wording for earlier weekly progress in both modes', () => {
    render(WEEKLY);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Earlier this week: 3 km');

    render(WEEKLY, true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Earlier this week: 3 km');
  });

  it('keeps the editor open after saving; the parent closes it on success', () => {
    render(DAILY, true);
    let cancelled = 0;
    component.editCancelled.subscribe(() => cancelled++);

    component.entryValue.set(1.5);
    component.save();

    expect(cancelled).toBe(0);
  });

  it('blocks saving and cancelling while a save is in flight', () => {
    render(DAILY, true);
    fixture.componentRef.setInput('isSaving', true);
    fixture.detectChanges();

    let saved = 0;
    let cancelled = 0;
    component.entrySaved.subscribe(() => saved++);
    component.editCancelled.subscribe(() => cancelled++);

    component.entryValue.set(1.5);
    component.save();
    component.cancelEditing();

    expect(saved).toBe(0);
    expect(cancelled).toBe(0);
  });

  it('shows the save error inside the editor', () => {
    render(DAILY, true);
    fixture.componentRef.setInput('saveError', "Couldn't save");
    fixture.detectChanges();

    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Couldn't save");
  });

  it('saves when Enter is pressed in the value input', () => {
    render(DAILY, true);
    component.entryValue.set(1.5);
    const saved = vi.fn();
    component.entrySaved.subscribe(saved);

    const input = fixture.nativeElement.querySelector('.goal-entry__persistent-input input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(saved).toHaveBeenCalledTimes(1);
  });

  it('gives the action button an accessible name that includes the goal', () => {
    render(DAILY);

    const button = (fixture.nativeElement as HTMLElement).querySelector('.goal-entry__action');
    expect(button?.getAttribute('aria-label')).toBe('Enter value for Water');
  });
});
