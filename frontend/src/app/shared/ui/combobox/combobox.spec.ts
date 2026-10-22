import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Combobox } from './combobox';

describe('Combobox positioning', () => {
  let fixture: ComponentFixture<Combobox>;
  let component: Combobox;
  let viewport: EventTarget & { offsetTop: number; height: number };

  beforeEach(async () => {
    viewport = Object.assign(new EventTarget(), { offsetTop: 0, height: 800 });
    vi.stubGlobal('visualViewport', viewport);

    await TestBed.configureTestingModule({ imports: [Combobox] }).compileComponents();
    fixture = TestBed.createComponent(Combobox);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('label', 'Unit');
    fixture.componentRef.setInput('options', [{ value: 'times', label: 'Times' }]);
    fixture.detectChanges();
    mockRect('.combobox__control', { top: 300, bottom: 348, right: 350, width: 120 });
    mockRect('.combobox__overlay', { top: 0, left: 0 });
  });

  afterEach(() => {
    fixture.destroy();
    vi.unstubAllGlobals();
  });

  function mockRect(selector: string, rect: Partial<DOMRect>): void {
    const element = fixture.nativeElement.querySelector(selector) as HTMLElement;
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect as DOMRect);
  }

  it('keeps a single option below the input when it fits above the keyboard', () => {
    viewport.height = 420;
    component.open();

    expect(component.listPosition()).toMatchObject({
      top: '356px',
      translate: '-100% 0',
      maxHeight: '64px',
    });
  });

  it('anchors the list above the input when the keyboard leaves no room below', () => {
    viewport.offsetTop = 100;
    viewport.height = 260;
    component.open();

    expect(component.listPosition()).toMatchObject({
      top: '292px',
      translate: '-100% -100%',
      maxHeight: '192px',
    });
  });

  it('compensates for a fixed origin moved by the browser while keeping the input anchor', () => {
    viewport.offsetTop = 100;
    viewport.height = 260;
    mockRect('.combobox__overlay', { top: -100, left: -20 });
    component.open();

    const position = component.listPosition();
    expect(parseFloat(position['top']) - 100).toBe(292);
    expect(parseFloat(position['left']) - 20).toBe(350);
  });

  it('limits the height to the available space even when both sides are small', () => {
    viewport.offsetTop = 280;
    viewport.height = 100;
    component.open();

    expect(component.listPosition()).toMatchObject({
      translate: '-100% 0',
      maxHeight: '24px',
    });
  });

  it('repositions when the keyboard resizes and pans the visible viewport', () => {
    component.open();
    viewport.offsetTop = 100;
    viewport.height = 260;
    viewport.dispatchEvent(new Event('resize'));
    expect(component.listPosition()['translate']).toBe('-100% -100%');

    mockRect('.combobox__control', { top: 250, bottom: 298, right: 350, width: 120 });
    viewport.dispatchEvent(new Event('scroll'));
    expect(component.listPosition()).toMatchObject({
      top: '306px',
      translate: '-100% 0',
    });
  });

  it('uses the window height when the visual viewport API is unavailable', () => {
    vi.stubGlobal('visualViewport', undefined);
    vi.stubGlobal('innerHeight', 380);
    component.open();

    expect(component.listPosition()['translate']).toBe('-100% -100%');
  });
});
