import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GoalEntryDayResponse } from '@models/goalModel';
import { GoalEntry } from './goal-entry';

const DAILY: GoalEntryDayResponse = {
  goal_id: 'g1',
  name: 'Water',
  icon: null,
  color: null,
  unit: 'L',
  period: 'daily',
  target_type: 'min',
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
