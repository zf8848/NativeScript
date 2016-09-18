import {ButtonBase} from "./button-common";
import {textProperty, formattedTextProperty} from "../text-base/text-base-common";
import {FormattedString} from "text/formatted-string";
import style = require("ui/styling/style");

export * from "./button-common";

@Implements([android.view.View.OnClickListener])
class ClickListener implements android.view.View.OnClickListener {
    constructor(public owner: WeakRef<Button>) { }

    public onClick(v: android.view.View): void {
        this.owner.get()._emit(ButtonBase.tapEvent);
    }
}

@Implements([android.view.View.OnTouchListener])
class TouchListener implements android.view.View.OnTouchListener {
    constructor(public owner: WeakRef<Button>) { }

    public onTouch(v: android.view.View, event: android.view.MotionEvent): boolean {
        if (event.getAction() === 0) { // down
            this.owner.get()._goToVisualState("highlighted");
        }
        else if (event.getAction() === 1) { // up
            this.owner.get()._goToVisualState("normal");
        }
        return false;
    }
}

export class Button extends ButtonBase {
    nativeView: android.widget.Button;
    private _isPressed: boolean = false;
    private _transformationMethod;

    get android(): android.widget.Button {
        return this.nativeView;
    }

    public _createUI() {
        this.nativeView = new android.widget.Button(this._context);
        this.nativeView.setOnClickListener(new ClickListener(new WeakRef(this)));
        this.nativeView.setOnTouchListener(new TouchListener(new WeakRef(this)));
    }

    public _onTextPropertyChanged(data: dependencyObservable.PropertyChangeData) {
        if (this.android) {
            this.android.setText(data.newValue + "");
        }
    }


    public _setFormattedTextPropertyToNative(value) {

    }

    get [textProperty.native](): string {
        return this.nativeView.getText();
    }
    set [textProperty.native](value: string) {
        this.nativeView.setText(value);
    }

    get [formattedTextProperty.native](): string {
        return this.nativeView.getText();
    }
    set [formattedTextProperty.native](value: FormattedString) {
        let newText = value ? value._formattedText : null;
        if (newText) {
            if (!this._transformationMethod) {
                this._transformationMethod = this.android.getTransformationMethod();
            }
            this.android.setTransformationMethod(null);
        } else {
            if (this._transformationMethod && !this.android.getTransformationMethod()) {
                this.android.setTransformationMethod(this._transformationMethod);
            }
        }

        this.android.setText(newText);
    }
}

export class ButtonStyler implements style.Styler {
    public static registerHandlers() {
        // !!! IMPORTANT !!! This was moved here because of the following bug: https://github.com/NativeScript/NativeScript/issues/1902
        // If there is no TextBase on the Page, the TextBaseStyler.registerHandlers
        // method was never called because the file it is called from was never required.

        // Register the same stylers for Button.
        // It also derives from TextView but is not under TextBase in our View hierarchy.
        var TextBaseStyler = <any>TBS;
        style.registerHandler(style.colorProperty, new style.StylePropertyChangedHandler(
            TextBaseStyler.setColorProperty,
            TextBaseStyler.resetColorProperty,
            TextBaseStyler.getNativeColorValue), "Button");

        style.registerHandler(style.fontInternalProperty, new style.StylePropertyChangedHandler(
            TextBaseStyler.setFontInternalProperty,
            TextBaseStyler.resetFontInternalProperty,
            TextBaseStyler.getNativeFontInternalValue), "Button");

        style.registerHandler(style.textAlignmentProperty, new style.StylePropertyChangedHandler(
            TextBaseStyler.setTextAlignmentProperty,
            TextBaseStyler.resetTextAlignmentProperty,
            TextBaseStyler.getNativeTextAlignmentValue), "Button");

        style.registerHandler(style.textDecorationProperty, new style.StylePropertyChangedHandler(
            TextBaseStyler.setTextDecorationProperty,
            TextBaseStyler.resetTextDecorationProperty), "Button");

        style.registerHandler(style.textTransformProperty, new style.StylePropertyChangedHandler(
            TextBaseStyler.setTextTransformProperty,
            TextBaseStyler.resetTextTransformProperty), "Button");

        style.registerHandler(style.whiteSpaceProperty, new style.StylePropertyChangedHandler(
            TextBaseStyler.setWhiteSpaceProperty,
            TextBaseStyler.resetWhiteSpaceProperty), "Button");

        if (parseInt(device.sdkVersion, 10) >= 21) {
            style.registerHandler(style.letterSpacingProperty, new style.StylePropertyChangedHandler(
                TextBaseStyler.setLetterSpacingProperty,
                TextBaseStyler.resetLetterSpacingProperty,
                TextBaseStyler.getLetterSpacingProperty), "Button");
        }
    }
}