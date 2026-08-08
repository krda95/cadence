import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Today } from './today';

describe('Today', () => {
  let component: Today;
  let fixture: ComponentFixture<Today>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Today],
    }).compileComponents();

    fixture = TestBed.createComponent(Today);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
