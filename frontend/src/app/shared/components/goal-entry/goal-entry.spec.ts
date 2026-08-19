import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GoalEntry } from './goal-entry';

describe('GoalEntry', () => {
  let component: GoalEntry;
  let fixture: ComponentFixture<GoalEntry>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GoalEntry],
    }).compileComponents();

    fixture = TestBed.createComponent(GoalEntry);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
