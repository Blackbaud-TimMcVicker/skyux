import {
  AfterContentInit,
  AfterViewInit,
  ChangeDetectorRef,
  Directive,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Optional,
  Renderer2,
  forwardRef,
} from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from '@angular/forms';
import { SkyAppLocaleProvider, SkyLibResourcesService } from '@skyux/i18n';

import moment from 'moment';
import { Subject } from 'rxjs';
import { distinctUntilChanged, takeUntil } from 'rxjs/operators';

import { SkyDateFormatter } from './date-formatter';
import { SkyDatepickerAdapterService } from './datepicker-adapter.service';
import { SkyDatepickerConfigService } from './datepicker-config.service';
import { SkyDatepickerComponent } from './datepicker.component';

const SKY_DATEPICKER_VALUE_ACCESSOR = {
  provide: NG_VALUE_ACCESSOR,
  useExisting: forwardRef(() => SkyDatepickerInputDirective),
  multi: true,
};

const SKY_DATEPICKER_VALIDATOR = {
  provide: NG_VALIDATORS,
  useExisting: forwardRef(() => SkyDatepickerInputDirective),
  multi: true,
};

@Directive({
  selector: '[skyDatepickerInput]',
  providers: [
    SKY_DATEPICKER_VALUE_ACCESSOR,
    SKY_DATEPICKER_VALIDATOR,
    SkyDatepickerAdapterService,
  ],
})
export class SkyDatepickerInputDirective
  implements
    OnInit,
    OnDestroy,
    AfterViewInit,
    AfterContentInit,
    ControlValueAccessor,
    Validator
{
  /**
   * The date format for the input. Place this attribute on the `input` element
   * to override the default in the `SkyDatepickerConfigService`.
   * @default "MM/DD/YYYY"
   */
  @Input()
  public set dateFormat(value: string | undefined) {
    /* istanbul ignore else */
    if (value !== this.#_dateFormat) {
      this.#_dateFormat = value;
      this.#applyDateFormat();
    }
  }

  // TODO: Refactor to not have getter logic
  public get dateFormat(): string | undefined {
    return (
      this.#_dateFormat ||
      this.#configService.dateFormat ||
      this.#preferredShortDateFormat
    );
  }

  /**
   * Whether to disable the datepicker.
   * @default false
   */
  @Input()
  public set disabled(value: boolean | undefined) {
    this.#_disabled = value || false;
    this.#datepickerComponent.disabled = value;
    this.#renderer.setProperty(
      this.#elementRef.nativeElement,
      'disabled',
      value
    );
  }

  public get disabled(): boolean {
    return this.#_disabled;
  }

  /**
   * The latest date that is available in the calendar. Place this attribute on
   * the `input` element to override the default in `SkyDatepickerConfigService`.
   */
  @Input()
  public set maxDate(value: Date | undefined) {
    this.#_maxDate = value;
    this.#datepickerComponent.maxDate = this.maxDate;

    this.#onValidatorChange();
  }

  // TODO: Refactor to not have getter logic
  public get maxDate(): Date | undefined {
    return this.#_maxDate || this.#configService.maxDate;
  }

  /**
   * The earliest date that is available in the calendar. Place this attribute on
   * the `input` element to override the default in `SkyDatepickerConfigService`. To avoid validation errors, the time associated with the minimum date must be midnight. This is necessary because the datepicker automatically sets the time on the `Date` object for selected dates to midnight in the current user's time zone.
   */
  @Input()
  public set minDate(value: Date | undefined) {
    this.#_minDate = value;
    this.#datepickerComponent.minDate = this.minDate;

    this.#onValidatorChange();
  }

  // TODO: Refactor to not have getter logic
  public get minDate(): Date | undefined {
    return this.#_minDate || this.#configService.minDate;
  }

  /**
   * Creates the datepicker input and calendar. Place this directive on an `input` element,
   * and wrap the input in a `sky-datepicker` component. The value that users select is driven
   * through the `ngModel` attribute specified on the `input` element.
   * @required
   */
  @Input()
  public set skyDatepickerInput(
    value: SkyDatepickerComponent | undefined | ''
  ) {
    if (value) {
      console.warn(
        '[Deprecation warning] You no longer need to provide a template reference variable ' +
          'to the `skyDatepickerInput` attribute (this will be a breaking change in the next ' +
          'major version release).\n' +
          'Do this instead:\n' +
          '<sky-datepicker>\n  <input skyDatepickerInput />\n</sky-datepicker>'
      );
    }
  }

  /**
   * Whether to disable date validation on the datepicker input.
   * @default false
   */
  @Input()
  public skyDatepickerNoValidate: boolean | undefined = false;

  /**
   * The starting day of the week in the calendar, where `0` sets the starting day
   * to Sunday. Place this attribute on the `input` element to override the default
   * in `SkyDatepickerConfigService`.
   * @default 0
   */
  @Input()
  public set startingDay(value: number | undefined) {
    this.#_startingDay = value;
    this.#datepickerComponent.startingDay = this.startingDay;

    this.#onValidatorChange();
  }

  // TODO: Refactor to not have getter logic
  public get startingDay(): number {
    return this.#_startingDay || this.#configService.startingDay;
  }

  /**
   * Whether the format of the date value must match the format from the `dateFormat` value.
   * If this property is `true` and the datepicker input directive cannot find an exact match, then
   * the input is marked as invalid.
   * If this property is `false` and the datepicker input directive cannot find an exact match, then
   * it attempts to format the string based on the [ISO 8601 standard format](https://www.iso.org/iso-8601-date-and-time-format.html).
   * @default false
   */
  @Input()
  public set strict(value: boolean | undefined) {
    this.#_strict = value || false;
  }

  public get strict(): boolean {
    return this.#_strict;
  }

  get #value(): any {
    return this.#_value;
  }

  set #value(value: any) {
    this.#updateValue(value);
  }

  #control: AbstractControl | undefined;
  #dateFormatter = new SkyDateFormatter();
  #initialPlaceholder: string;
  #preferredShortDateFormat: string | undefined;
  #ngUnsubscribe = new Subject<void>();

  #_dateFormat: string | undefined;
  #_disabled = false;
  #_maxDate: Date | undefined;
  #_minDate: Date | undefined;
  #_startingDay: number | undefined;
  #_strict = false;
  #_value: any;

  #adapter: SkyDatepickerAdapterService;
  #changeDetector: ChangeDetectorRef;
  #configService: SkyDatepickerConfigService;
  #elementRef: ElementRef;
  #localeProvider: SkyAppLocaleProvider;
  #renderer: Renderer2;
  #resourcesService: SkyLibResourcesService;
  #datepickerComponent: SkyDatepickerComponent;

  constructor(
    adapter: SkyDatepickerAdapterService,
    changeDetector: ChangeDetectorRef,
    configService: SkyDatepickerConfigService,
    elementRef: ElementRef,
    localeProvider: SkyAppLocaleProvider,
    renderer: Renderer2,
    resourcesService: SkyLibResourcesService,
    @Optional() datepickerComponent?: SkyDatepickerComponent
  ) {
    if (!datepickerComponent) {
      throw new Error(
        'You must wrap the `skyDatepickerInput` directive within a ' +
          '`<sky-datepicker>` component!'
      );
    }
    this.#adapter = adapter;
    this.#changeDetector = changeDetector;
    this.#configService = configService;
    this.#elementRef = elementRef;
    this.#localeProvider = localeProvider;
    this.#renderer = renderer;
    this.#resourcesService = resourcesService;
    this.#datepickerComponent = datepickerComponent;
    this.#initialPlaceholder = this.#adapter.getPlaceholder(this.#elementRef);
    this.#updatePlaceholder();

    this.#localeProvider
      .getLocaleInfo()
      .pipe(takeUntil(this.#ngUnsubscribe))
      .subscribe((localeInfo) => {
        SkyDateFormatter.setLocale(localeInfo.locale);
        this.#preferredShortDateFormat =
          SkyDateFormatter.getPreferredShortDateFormat();
        this.#applyDateFormat();
      });
  }

  public ngOnInit(): void {
    const element = this.#elementRef.nativeElement;

    this.#renderer.addClass(element, 'sky-form-control');

    const hasAriaLabel = element.getAttribute('aria-label');

    if (!hasAriaLabel) {
      this.#resourcesService
        .getString('skyux_date_field_default_label')
        .pipe(takeUntil(this.#ngUnsubscribe))
        .subscribe((value: string) => {
          this.#renderer.setAttribute(element, 'aria-label', value);
        });
    }
  }

  public ngAfterContentInit(): void {
    this.#datepickerComponent.dateChange
      .pipe(distinctUntilChanged())
      .pipe(takeUntil(this.#ngUnsubscribe))
      .subscribe((value: Date) => {
        this.#value = value;
        this.#onTouched();
      });
  }

  public ngAfterViewInit(): void {
    // This is needed to address a bug in Angular 4.
    // When a control value is set initially, its value is not represented on the view.
    // See: https://github.com/angular/angular/issues/13792
    // Of note is the parent check which allows us to determine if the form is reactive.
    // Without this check there is a changed before checked error
    /* istanbul ignore else */
    if (this.#control && this.#control.parent) {
      setTimeout(() => {
        this.#control?.setValue(this.#value, {
          emitEvent: false,
        });

        this.#changeDetector.markForCheck();
      });
    }
  }

  public ngOnDestroy(): void {
    this.#ngUnsubscribe.next();
    this.#ngUnsubscribe.complete();
  }

  @HostListener('change', ['$event'])
  public onInputChange(event: any) {
    const value = event.target.value;

    if (this.skyDatepickerNoValidate) {
      this.#onValueChange(value);
      return;
    }

    // Don't try to parse the string value into a Date value if it is malformed.
    if (this.#isDateStringValid(value)) {
      this.#onValueChange(value);
      return;
    }

    this.#_value = value;
    this.#onChange(value);

    this.#control?.setErrors({
      skyDate: {
        invalid: true,
      },
    });
  }

  @HostListener('blur')
  public onInputBlur(): void {
    this.#onTouched();
  }

  @HostListener('input')
  public onInput(): void {
    this.#control?.markAsDirty();
  }

  public writeValue(value: any): void {
    this.#updateValue(value, false);
  }

  public validate(control: AbstractControl): ValidationErrors | null {
    if (!this.#control) {
      this.#control = control;
      // Account for any date conversion that may have occurred prior to validation.
      if (this.#control.value !== this.#value) {
        this.#control.patchValue(this.#value, { emitEvent: false });
      }
    }

    if (this.skyDatepickerNoValidate) {
      return null;
    }

    const value: unknown = control.value;

    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      const isDateValid = this.#dateFormatter.dateIsValid(value);

      if (!isDateValid) {
        // Mark the invalid control as touched so that the input's invalid CSS styles appear.
        // (This is only required when the invalid value is set by the FormControl constructor.)
        this.#control.markAsTouched();

        return {
          skyDate: {
            invalid: value,
          },
        };
      }

      const minDate = this.minDate;

      if (
        minDate &&
        this.#dateFormatter.dateIsValid(minDate) &&
        value < minDate
      ) {
        return {
          skyDate: {
            minDate,
          },
        };
      }

      const maxDate = this.maxDate;

      if (
        maxDate &&
        this.#dateFormatter.dateIsValid(maxDate) &&
        value > maxDate
      ) {
        return {
          skyDate: {
            maxDate,
          },
        };
      }
    } else {
      // Mark the invalid control as touched so that the input's invalid CSS styles appear.
      // (This is only required when the invalid value is set by the FormControl constructor.)
      this.#control.markAsTouched();

      return {
        skyDate: {
          invalid: value,
        },
      };
    }
    return null;
  }

  public registerOnChange(fn: (value: any) => void): void {
    this.#onChange = fn;
  }

  public registerOnTouched(fn: () => void): void {
    this.#onTouched = fn;
  }

  public registerOnValidatorChange(fn: () => void): void {
    this.#onValidatorChange = fn;
  }

  public setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
    this.#datepickerComponent.disabled = disabled;
  }

  /**
   * Detects changes to the underlying input element's value and updates the ngModel accordingly.
   * This is useful if you need to update the ngModel value before the input element loses focus.
   */
  public detectInputValueChange(): void {
    this.#onValueChange(this.#elementRef.nativeElement.value);
  }

  #applyDateFormat(): void {
    this.#updatePlaceholder();
    if (this.#value) {
      const formattedDate = this.#dateFormatter.format(
        this.#value,
        this.dateFormat
      );
      this.#setInputElementValue(formattedDate);
      this.#changeDetector.markForCheck();
    }
  }

  #onValueChange(newValue: string): void {
    this.#value = newValue;
  }

  #setInputElementValue(value: string): void {
    this.#renderer.setProperty(this.#elementRef.nativeElement, 'value', value);
  }

  /**
   * Gets the date value from a value - if possible.
   * Will not convert unconvertible dates or numbers outside of the current month's number of days.
   * Returns `undefined` if the value can not be converted.
   */
  #getDateValue(value: unknown): Date | undefined {
    if (value instanceof Date) {
      return value;
    } else if (typeof value === 'string') {
      return this.#getShortcutOrDateValue(value);
    }
    return undefined;
  }

  /**
   * Converts a string to a date object if the string is a valid date string.
   * It will also convert numeric input to a date if that number is within the current month's number of days.
   * If the string can not be converted, `undefined` be returned.
   */
  #getShortcutOrDateValue(value: string): Date | undefined {
    const num = Number(value);
    if (Number.isInteger(num)) {
      // We require 8 digits in order to know that we have all information needed to determine what part of the number is the month (2), day (2), and year (4).
      if (value.length === 8) {
        const regex = new RegExp(/\b(MM)\b|\b(DD)\b|\b(YY)\b|\b(YYYY)\b/, 'g');
        const formatTokensOnly = this.dateFormat
          ?.match(regex)
          ?.join('')
          .replace(new RegExp(/Y+/), 'YYYY');

        if (formatTokensOnly && formatTokensOnly.length === 8) {
          const date = this.#dateFormatter.getDateFromString(
            value,
            formatTokensOnly,
            true
          );
          if (this.#dateFormatter.dateIsValid(date)) {
            return date;
          }
        }
      }
      const now = new Date();
      const shortcutDate = new Date(now.getFullYear(), now.getMonth(), num);
      const daysInMonth = shortcutDate.getDate();
      if (num > 0 && num <= daysInMonth) {
        return shortcutDate;
      }
    } else {
      const date = this.#dateFormatter.getDateFromString(
        value,
        this.dateFormat,
        this.strict
      );
      if (this.#dateFormatter.dateIsValid(date)) {
        return date;
      }
    }
    return undefined;
  }

  /**
   * Validates the input value to ensure it is formatted correctly.
   */
  #isDateStringValid(value: string): boolean {
    if (!value || typeof value !== 'string') {
      return true;
    }

    // Does the value only include digits, dashes, or slashes?
    const regexp = /^[\d/-]+$/;
    const isValid = regexp.test(value);

    if (isValid) {
      return true;
    }

    // If not, does it conform to the standard ISO format?
    const isValidIso = moment(value, moment.ISO_8601).isValid();

    return isValidIso;
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  // istanbul ignore next
  #onChange = (_: any) => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  // istanbul ignore next
  #onTouched = () => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  // istanbul ignore next
  #onValidatorChange = () => {};

  #updatePlaceholder(): void {
    if (!this.#initialPlaceholder && this.dateFormat) {
      this.#adapter.setPlaceholder(this.#elementRef, this.dateFormat);
    }
  }

  /**
   * Update the value of the form control and input element
   * @param emitEvent Denotes if we emit an event to the consumer's form control. We do not want to do this if the value is being updated via a `setValue` call or a `patchValue` call as this is already handled by Angular.
   * In these cases we do not want to fire `onChange` as it will cause extra `valueChange` and `statusChange` events and the status of the form should not be affected by these changes.
   */
  #updateValue(value: any, emitEvent = true): void {
    if (this.#_value === value) {
      return;
    }

    const isValidDateString = this.#isDateStringValid(value);

    // If the string value supplied is malformed, do not set the value to its Date equivalent.
    // (JavaScript's Date parser will convert poorly formatted dates to Date objects, such as "abc 123", which isn't ideal.)
    if (!isValidDateString) {
      this.#_value = value;
      if (emitEvent) {
        this.#onChange(this.#_value);
      } else {
        this.#control?.setValue(this.#_value, { emitEvent: false });
      }

      this.#datepickerComponent.selectedDate = this.#_value;

      this.#setInputElementValue(value);
    } else {
      // This value represents the date value for the input if possible.
      // This value will take into account all shortcut functionality.
      const dateValue: Date | undefined = this.#getDateValue(value);

      const areDatesEqual =
        this.#_value instanceof Date &&
        dateValue &&
        dateValue.getTime() === this.#_value.getTime();

      if (dateValue !== this.#_value || !areDatesEqual) {
        this.#_value = dateValue || value;
        if (emitEvent) {
          this.#onChange(this.#_value);
        } else {
          this.#control?.setValue(this.#_value, { emitEvent: false });
        }

        this.#datepickerComponent.selectedDate = this.#_value;
      }

      if (dateValue) {
        const formattedDateString = this.#dateFormatter.format(
          dateValue,
          this.dateFormat
        );
        this.#setInputElementValue(formattedDateString);
      } else {
        this.#setInputElementValue(value || '');
      }
    }
  }
}
