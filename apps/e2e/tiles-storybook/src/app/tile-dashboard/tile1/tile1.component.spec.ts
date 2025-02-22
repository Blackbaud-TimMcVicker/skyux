import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { TileDashboardModule } from '../tile-dashboard.module';
import { TileParameters } from '../tile-parameters.token';

import { Tile1Component } from './tile1.component';

describe('Tile1Component', () => {
  let component: Tile1Component;
  let fixture: ComponentFixture<Tile1Component>;

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(), // Deprecated
        removeListener: jest.fn(), // Deprecated
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    TestBed.configureTestingModule({
      imports: [NoopAnimationsModule, TileDashboardModule],
      providers: [
        {
          provide: TileParameters,
          useValue: {
            tileName: 'Test Tile',
            showInlineHelp: false,
          },
        },
      ],
    });

    fixture = TestBed.createComponent(Tile1Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    const logSpy = jest.spyOn(console, 'log');
    expect(component).toBeTruthy();
    component.tileSettingsClick();
    expect(logSpy).toHaveBeenCalledWith('Tile settings clicked!');
  });
});
