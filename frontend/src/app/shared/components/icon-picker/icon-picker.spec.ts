import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IconPicker } from './icon-picker';

describe('IconPicker', () => {
  let component: IconPicker;
  let fixture: ComponentFixture<IconPicker>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IconPicker],
    }).compileComponents();

    fixture = TestBed.createComponent(IconPicker);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
