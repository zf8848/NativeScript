import { View as ViewDefinition, Point, Size } from "ui/core/view";
import { Color } from "color";
import { Animation, AnimationPromise } from "ui/animation";
import { Source } from "utils/debug";
import { Background } from "ui/styling/background";
import {
    ViewBase, getEventOrGestureName, Observable, EventData, Style,
    Property, InheritedProperty, CssProperty, ShorthandProperty, InheritedCssProperty,
    gestureFromString, isIOS, traceEnabled, traceWrite, traceCategories, traceNotifyEvent, printUnregisteredProperties
} from "./view-base";
import { observe as gestureObserve, GesturesObserver, GestureTypes, GestureEventData } from "ui/gestures";
import { Font, parseFont, FontStyle, FontWeight } from "ui/styling/font";
import { fontSizeConverter } from "../styling/converters";

// TODO: Remove this and start using string as source (for android).
import { fromFileOrResource, fromBase64, fromUrl } from "image-source";
import { isDataURI, isFileOrResourcePath, layout } from "utils/utils";

export { layout };
export * from "./view-base";

export {
    GestureTypes, GesturesObserver, GestureEventData,
    Animation, AnimationPromise,
    Background, Font, Color
}

// registerSpecialProperty("class", (instance: ViewDefinition, propertyValue: string) => {
//     instance.className = propertyValue;
// });
// registerSpecialProperty("text", (instance, propertyValue) => {
//     instance.set("text", propertyValue);
// });

Style.prototype.effectiveMinWidth = 0;
Style.prototype.effectiveMinHeight = 0;
Style.prototype.effectiveWidth = 0;
Style.prototype.effectiveHeight = 0;
Style.prototype.effectiveMarginTop = 0;
Style.prototype.effectiveMarginRight = 0;
Style.prototype.effectiveMarginBottom = 0;
Style.prototype.effectiveMarginLeft = 0;
Style.prototype.effectivePaddingTop = 0;
Style.prototype.effectivePaddingRight = 0;
Style.prototype.effectivePaddingBottom = 0;
Style.prototype.effectivePaddingLeft = 0;
Style.prototype.effectiveBorderTopWidth = 0;
Style.prototype.effectiveBorderRightWidth = 0;
Style.prototype.effectiveBorderBottomWidth = 0;
Style.prototype.effectiveBorderLeftWidth = 0;

export function PseudoClassHandler(...pseudoClasses: string[]): MethodDecorator {
    let stateEventNames = pseudoClasses.map(s => ":" + s);
    let listeners = Symbol("listeners");
    return <T>(target: Object, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>) => {
        function update(change: number) {
            let prev = this[listeners] || 0;
            let next = prev + change;
            if (prev <= 0 && next > 0) {
                this[propertyKey](true);
            } else if (prev > 0 && next <= 0) {
                this[propertyKey](false);
            }
        }
        stateEventNames.forEach(s => target[s] = update);
    }
}

let viewIdCounter = 0;

export abstract class ViewCommon extends ViewBase implements ViewDefinition {
    // Dynamic properties.
    left: Length;
    top: Length;
    effectiveLeft: number;
    effectiveTop: number;
    dock: "left" | "top" | "right" | "bottom";
    row: number;
    col: number;
    rowSpan: number;
    colSpan: number;

    public static loadedEvent = "loaded";
    public static unloadedEvent = "unloaded";

    private _measuredWidth: number;
    private _measuredHeight: number;

    _currentWidthMeasureSpec: number;
    _currentHeightMeasureSpec: number;
    private _oldLeft: number;
    private _oldTop: number;
    private _oldRight: number;
    private _oldBottom: number;

    private _isLayoutValid: boolean;
    private _cssType: string;

    private _updatingInheritedProperties: boolean;


    public _domId: number;
    public _isAddedToNativeVisualTree: boolean;
    public _gestureObservers = {};

    // public parent: ViewCommon;

    constructor() {
        super();

        this._domId = viewIdCounter++;
        this._goToVisualState("normal");
    }

    observe(type: GestureTypes, callback: (args: GestureEventData) => void, thisArg?: any): void {
        if (!this._gestureObservers[type]) {
            this._gestureObservers[type] = [];
        }

        this._gestureObservers[type].push(gestureObserve(this, type, callback, thisArg));
    }

    public getGestureObservers(type: GestureTypes): Array<GesturesObserver> {
        return this._gestureObservers[type];
    }

    public addEventListener(arg: string | GestureTypes, callback: (data: EventData) => void, thisArg?: any) {
        if (typeof arg === "string") {
            arg = getEventOrGestureName(arg);

            let gesture = gestureFromString(arg);
            if (gesture && !this._isEvent(arg)) {
                this.observe(gesture, callback, thisArg);
            } else {
                let events = (arg).split(",");
                if (events.length > 0) {
                    for (let i = 0; i < events.length; i++) {
                        let evt = events[i].trim();
                        let gst = gestureFromString(evt);
                        if (gst && !this._isEvent(arg)) {
                            this.observe(gst, callback, thisArg);
                        } else {
                            super.addEventListener(evt, callback, thisArg);
                        }
                    }
                } else {
                    super.addEventListener(arg, callback, thisArg);
                }
            }
        } else if (typeof arg === "number") {
            this.observe(<GestureTypes>arg, callback, thisArg);
        }
    }

    public removeEventListener(arg: string | GestureTypes, callback?: any, thisArg?: any) {
        if (typeof arg === "string") {
            let gesture = gestureFromString(arg);
            if (gesture && !this._isEvent(arg)) {
                this._disconnectGestureObservers(gesture);
            } else {
                let events = arg.split(",");
                if (events.length > 0) {
                    for (let i = 0; i < events.length; i++) {
                        let evt = events[i].trim();
                        let gst = gestureFromString(evt);
                        if (gst && !this._isEvent(arg)) {
                            this._disconnectGestureObservers(gst);
                        } else {
                            super.removeEventListener(evt, callback, thisArg);
                        }
                    }
                } else {
                    super.removeEventListener(arg, callback, thisArg);
                }

            }
        } else if (typeof arg === "number") {
            this._disconnectGestureObservers(<GestureTypes>arg);
        }
    }

    private _isEvent(name: string): boolean {
        return this.constructor && `${name}Event` in this.constructor;
    }

    private _disconnectGestureObservers(type: GestureTypes): void {
        let observers = this.getGestureObservers(type);
        if (observers) {
            for (let i = 0; i < observers.length; i++) {
                observers[i].disconnect();
            }
        }
    }

    // START Style property shortcuts
    get borderColor(): string | Color {
        return this.style.borderColor;
    }
    set borderColor(value: string | Color) {
        this.style.borderColor = value;
    }

    get borderTopColor(): Color {
        return this.style.borderTopColor;
    }
    set borderTopColor(value: Color) {
        this.style.borderTopColor = value;
    }

    get borderRightColor(): Color {
        return this.style.borderRightColor;
    }
    set borderRightColor(value: Color) {
        this.style.borderRightColor = value;
    }

    get borderBottomColor(): Color {
        return this.style.borderBottomColor;
    }
    set borderBottomColor(value: Color) {
        this.style.borderBottomColor = value;
    }

    get borderLeftColor(): Color {
        return this.style.borderLeftColor;
    }
    set borderLeftColor(value: Color) {
        this.style.borderLeftColor = value;
    }

    get borderWidth(): string | number {
        return this.style.borderWidth;
    }
    set borderWidth(value: string | number) {
        this.style.borderWidth = value;
    }

    get borderTopWidth(): Length {
        return this.style.borderTopWidth;
    }
    set borderTopWidth(value: Length) {
        this.style.borderTopWidth = value;
    }

    get borderRightWidth(): Length {
        return this.style.borderRightWidth;
    }
    set borderRightWidth(value: Length) {
        this.style.borderRightWidth = value;
    }

    get borderBottomWidth(): Length {
        return this.style.borderBottomWidth;
    }
    set borderBottomWidth(value: Length) {
        this.style.borderBottomWidth = value;
    }

    get borderLeftWidth(): Length {
        return this.style.borderLeftWidth;
    }
    set borderLeftWidth(value: Length) {
        this.style.borderLeftWidth = value;
    }

    get borderRadius(): string | number {
        return this.style.borderRadius;
    }
    set borderRadius(value: string | number) {
        this.style.borderRadius = value;
    }

    get borderTopLeftRadius(): number {
        return this.style.borderTopLeftRadius;
    }
    set borderTopLeftRadius(value: number) {
        this.style.borderTopLeftRadius = value;
    }

    get borderTopRightRadius(): number {
        return this.style.borderTopRightRadius;
    }
    set borderTopRightRadius(value: number) {
        this.style.borderTopRightRadius = value;
    }

    get borderBottomRightRadius(): number {
        return this.style.borderBottomRightRadius;
    }
    set borderBottomRightRadius(value: number) {
        this.style.borderBottomRightRadius = value;
    }

    get borderBottomLeftRadius(): number {
        return this.style.borderBottomLeftRadius;
    }
    set borderBottomLeftRadius(value: number) {
        this.style.borderBottomLeftRadius = value;
    }

    get color(): Color {
        return this.style.color;
    }
    set color(value: Color) {
        this.style.color = value;
    }

    get backgroundColor(): Color {
        return this.style.backgroundColor;
    }
    set backgroundColor(value: Color) {
        this.style.backgroundColor = value;
    }

    get backgroundImage(): string {
        return this.style.backgroundImage;
    }
    set backgroundImage(value: string) {
        this.style.backgroundImage = value;
    }

    get minWidth(): Length {
        return this.style.minWidth;
    }
    set minWidth(value: Length) {
        this.style.minWidth = value;
    }

    get minHeight(): Length {
        return this.style.minHeight;
    }
    set minHeight(value: Length) {
        this.style.minHeight = value;
    }

    get width(): PercentLength {
        return this.style.width;
    }
    set width(value: PercentLength) {
        this.style.width = value;
    }

    get height(): PercentLength {
        return this.style.height;
    }
    set height(value: PercentLength) {
        this.style.height = value;
    }

    get margin(): string {
        return this.style.margin;
    }
    set margin(value: string) {
        this.style.margin = value;
    }

    get marginLeft(): PercentLength {
        return this.style.marginLeft;
    }
    set marginLeft(value: PercentLength) {
        this.style.marginLeft = value;
    }

    get marginTop(): PercentLength {
        return this.style.marginTop;
    }
    set marginTop(value: PercentLength) {
        this.style.marginTop = value;
    }

    get marginRight(): PercentLength {
        return this.style.marginRight;
    }
    set marginRight(value: PercentLength) {
        this.style.marginRight = value;
    }

    get marginBottom(): PercentLength {
        return this.style.marginBottom;
    }
    set marginBottom(value: PercentLength) {
        this.style.marginBottom = value;
    }

    get horizontalAlignment(): "left" | "center" | "middle" | "right" | "stretch" {
        return this.style.horizontalAlignment;
    }
    set horizontalAlignment(value: "left" | "center" | "middle" | "right" | "stretch") {
        this.style.horizontalAlignment = value;
    }

    get verticalAlignment(): "top" | "center" | "middle" | "bottom" | "stretch" {
        return this.style.verticalAlignment;
    }
    set verticalAlignment(value: "top" | "center" | "middle" | "bottom" | "stretch") {
        this.style.verticalAlignment = value;
    }

    get visibility(): "visible" | "hidden" | "collapse" | "collapsed" {
        return this.style.visibility;
    }
    set visibility(value: "visible" | "hidden" | "collapse" | "collapsed") {
        this.style.visibility = value;
    }

    get opacity(): number {
        return this.style.opacity;
    }
    set opacity(value: number) {
        this.style.opacity = value;
    }

    get rotate(): number {
        return this.style.rotate;
    }
    set rotate(value: number) {
        this.style.rotate = value;
    }

    get translateX(): number {
        return this.style.translateX;
    }
    set translateX(value: number) {
        this.style.translateX = value;
    }

    get translateY(): number {
        return this.style.translateY;
    }
    set translateY(value: number) {
        this.style.translateY = value;
    }

    get scaleX(): number {
        return this.style.scaleX;
    }
    set scaleX(value: number) {
        this.style.scaleX = value;
    }

    get scaleY(): number {
        return this.style.scaleY;
    }
    set scaleY(value: number) {
        this.style.scaleY = value;
    }

    //END Style property shortcuts

    public automationText: string;
    public originX: number;
    public originY: number;
    public isEnabled: boolean;
    public isUserInteractionEnabled: boolean;

    get isLayoutValid(): boolean {
        return this._isLayoutValid;
    }

    get cssType(): string {
        if (!this._cssType) {
            this._cssType = this.typeName.toLowerCase();
        }
        return this._cssType;
    }

    get isLayoutRequired(): boolean {
        return true;
    }

    // public _onPropertyChanged(property: Property, oldValue: any, newValue: any) {
    //     super._onPropertyChanged(property, oldValue, newValue);

    //     if (this._childrenCount > 0) {
    //         let shouldUpdateInheritableProps = (property.inheritable && !(property instanceof styling.Property));
    //         if (shouldUpdateInheritableProps) {
    //             this._updatingInheritedProperties = true;
    //             this._eachChildView((child) => {
    //                 child._setValue(property, this._getValue(property), ValueSource.Inherited);
    //                 return true;
    //             });
    //             this._updatingInheritedProperties = false;
    //         }
    //     }

    //     this._checkMetadataOnPropertyChanged(property.metadata);
    // }

    // public _isInheritedChange() {
    //     if (this._updatingInheritedProperties) {
    //         return true;
    //     }
    //     let parentView: ViewDefinition;
    //     parentView = <View>(this.parent);
    //     while (parentView) {
    //         if (parentView._updatingInheritedProperties) {
    //             return true;
    //         }
    //         parentView = <View>(parentView.parent);
    //     }
    //     return false;
    // }

    // public _checkMetadataOnPropertyChanged(metadata: doPropertyMetadata) {
    //     if (metadata.affectsLayout) {
    //         this.requestLayout();
    //     }

    //     if (metadata.affectsStyle) {
    //         this.style._resetCssValues();
    //         this._applyStyleFromScope();
    //         this._eachChildView((v) => {
    //             v._checkMetadataOnPropertyChanged(metadata);
    //             return true;
    //         });
    //     }
    // }

    public measure(widthMeasureSpec: number, heightMeasureSpec: number): void {
        this._setCurrentMeasureSpecs(widthMeasureSpec, heightMeasureSpec);
    }

    public layout(left: number, top: number, right: number, bottom: number): void {
        this._setCurrentLayoutBounds(left, top, right, bottom);
    }

    public getMeasuredWidth(): number {
        return this._measuredWidth & layout.MEASURED_SIZE_MASK || 0;
    }

    public getMeasuredHeight(): number {
        return this._measuredHeight & layout.MEASURED_SIZE_MASK || 0;
    }

    public getMeasuredState(): number {
        return (this._measuredWidth & layout.MEASURED_STATE_MASK)
            | ((this._measuredHeight >> layout.MEASURED_HEIGHT_STATE_SHIFT)
                & (layout.MEASURED_STATE_MASK >> layout.MEASURED_HEIGHT_STATE_SHIFT));
    }

    public setMeasuredDimension(measuredWidth: number, measuredHeight: number): void {
        this._measuredWidth = measuredWidth;
        this._measuredHeight = measuredHeight;
        if (traceEnabled) {
            traceWrite(this + " :setMeasuredDimension: " + measuredWidth + ", " + measuredHeight, traceCategories.Layout);
        }
    }

    public requestLayout(): void {
        this._isLayoutValid = false;
    }

    public abstract onMeasure(widthMeasureSpec: number, heightMeasureSpec: number): void;
    public abstract onLayout(left: number, top: number, right: number, bottom: number): void;
    public abstract layoutNativeView(left: number, top: number, right: number, bottom: number): void;

    public static resolveSizeAndState(size: number, specSize: number, specMode: number, childMeasuredState: number): number {
        let result = size;
        switch (specMode) {
            case layout.UNSPECIFIED:
                result = size;
                break;

            case layout.AT_MOST:
                if (specSize < size) {
                    result = Math.round(specSize + 0.499) | layout.MEASURED_STATE_TOO_SMALL;
                }
                break;

            case layout.EXACTLY:
                result = specSize;
                break;
        }

        return Math.round(result + 0.499) | (childMeasuredState & layout.MEASURED_STATE_MASK);
    }

    public static combineMeasuredStates(curState: number, newState): number {
        return curState | newState;
    }

    public static layoutChild(parent: ViewDefinition, child: ViewDefinition, left: number, top: number, right: number, bottom: number): void {
        if (!child || child.isCollapsed) {
            return;
        }

        let childStyle = child.style;

        let childTop: number;
        let childLeft: number;

        let childWidth = child.getMeasuredWidth();
        let childHeight = child.getMeasuredHeight();

        let effectiveMarginTop = childStyle.effectiveMarginTop;
        let effectiveMarginBottom = childStyle.effectiveMarginBottom;

        let vAlignment: string;
        if (childStyle.effectiveHeight >= 0 && childStyle.verticalAlignment === "stretch") {
            vAlignment = "center";
        }
        else {
            vAlignment = childStyle.verticalAlignment;
        }

        let marginTop = childStyle.marginTop;
        let marginBottom = childStyle.marginBottom;
        let marginLeft = childStyle.marginLeft;
        let marginRight = childStyle.marginRight;

        switch (vAlignment) {
            case "top":
                childTop = top + effectiveMarginTop;
                break;

            case "center":
            case "middle":
                childTop = top + (bottom - top - childHeight + (effectiveMarginTop - effectiveMarginBottom)) / 2;
                break;

            case "bottom":
                childTop = bottom - childHeight - effectiveMarginBottom;
                break;

            case "stretch":
            default:
                childTop = top + effectiveMarginTop;
                childHeight = bottom - top - (effectiveMarginTop + effectiveMarginBottom);
                break;
        }

        let effectiveMarginLeft = childStyle.effectiveMarginLeft;
        let effectiveMarginRight = childStyle.effectiveMarginRight;

        let hAlignment: string;
        if (childStyle.effectiveWidth >= 0 && childStyle.horizontalAlignment === "stretch") {
            hAlignment = "center";
        }
        else {
            hAlignment = childStyle.horizontalAlignment;
        }

        switch (hAlignment) {
            case "left":
                childLeft = left + effectiveMarginLeft;
                break;

            case "center":
            case "middle":
                childLeft = left + (right - left - childWidth + (effectiveMarginLeft - effectiveMarginRight)) / 2;
                break;

            case "right":
                childLeft = right - childWidth - effectiveMarginRight;
                break;

            case "stretch":
            default:
                childLeft = left + effectiveMarginLeft;
                childWidth = right - left - (effectiveMarginLeft + effectiveMarginRight);
                break;
        }

        let childRight = Math.round(childLeft + childWidth);
        let childBottom = Math.round(childTop + childHeight);
        childLeft = Math.round(childLeft);
        childTop = Math.round(childTop);

        if (traceEnabled) {
            traceWrite(child.parent + " :layoutChild: " + child + " " + childLeft + ", " + childTop + ", " + childRight + ", " + childBottom, traceCategories.Layout);
        }

        child.layout(childLeft, childTop, childRight, childBottom);
    }

    public static measureChild(parent: ViewCommon, child: ViewCommon, widthMeasureSpec: number, heightMeasureSpec: number): { measuredWidth: number; measuredHeight: number } {
        let measureWidth = 0;
        let measureHeight = 0;

        if (child && !child.isCollapsed) {
            let density = layout.getDisplayDensity();
            let width = layout.getMeasureSpecSize(widthMeasureSpec);
            let widthMode = layout.getMeasureSpecMode(widthMeasureSpec);

            let height = layout.getMeasureSpecSize(heightMeasureSpec);
            let heightMode = layout.getMeasureSpecMode(heightMeasureSpec);

            let parentWidthMeasureSpec = parent._currentWidthMeasureSpec;
            updateChildLayoutParams(child, parent, density);

            let style = child.style;
            let horizontalMargins = style.effectiveMarginLeft + style.effectiveMarginRight;
            let verticalMargins = style.effectiveMarginTop + style.effectiveMarginRight;

            let childWidthMeasureSpec = ViewCommon.getMeasureSpec(width, widthMode, horizontalMargins, style.effectiveWidth, style.horizontalAlignment === "stretch");
            let childHeightMeasureSpec = ViewCommon.getMeasureSpec(height, heightMode, verticalMargins, style.effectiveHeight, style.verticalAlignment === "stretch");

            if (traceEnabled) {
                traceWrite(child.parent + " :measureChild: " + child + " " + layout.measureSpecToString(childWidthMeasureSpec) + ", " + layout.measureSpecToString(childHeightMeasureSpec), traceCategories.Layout);
            }

            child.measure(childWidthMeasureSpec, childHeightMeasureSpec);
            measureWidth = Math.round(child.getMeasuredWidth() + horizontalMargins);
            measureHeight = Math.round(child.getMeasuredHeight() + verticalMargins);
        }

        return { measuredWidth: measureWidth, measuredHeight: measureHeight };
    }

    private static getMeasureSpec(parentLength: number, parentSpecMode: number, margins: number, childLength: number, stretched: boolean): number {
        let resultSize: number;
        let resultMode: number;

        // We want a specific size... let be it.
        if (childLength >= 0) {
            // If mode !== UNSPECIFIED we take the smaller of parentLength and childLength
            // Otherwise we will need to clip the view but this is not possible in all Android API levels.
            resultSize = parentSpecMode === layout.UNSPECIFIED ? childLength : Math.min(parentLength, childLength);
            resultMode = layout.EXACTLY;
        }
        else {
            switch (parentSpecMode) {
                // Parent has imposed an exact size on us
                case layout.EXACTLY:
                    resultSize = Math.max(0, parentLength - margins);
                    // if stretched - nativeView wants to be our size. So be it.
                    // else - nativeView wants to determine its own size. It can't be bigger than us.
                    resultMode = stretched ? layout.EXACTLY : layout.AT_MOST;
                    break;

                // Parent has imposed a maximum size on us
                case layout.AT_MOST:
                    resultSize = Math.max(0, parentLength - margins);
                    resultMode = layout.AT_MOST;
                    break;

                // Equivalent to measure with Infinity.
                case layout.UNSPECIFIED:
                    resultSize = 0;
                    resultMode = layout.UNSPECIFIED;
                    break;
            }
        }

        return layout.makeMeasureSpec(resultSize, resultMode);
    }

    _setCurrentMeasureSpecs(widthMeasureSpec: number, heightMeasureSpec: number): boolean {
        let changed: boolean = this._currentWidthMeasureSpec !== widthMeasureSpec || this._currentHeightMeasureSpec !== heightMeasureSpec;
        this._currentWidthMeasureSpec = widthMeasureSpec;
        this._currentHeightMeasureSpec = heightMeasureSpec;
        return changed;
    }

    _getCurrentLayoutBounds(): { left: number; top: number; right: number; bottom: number } {
        return { left: this._oldLeft, top: this._oldTop, right: this._oldRight, bottom: this._oldBottom }
    }

    /**
     * Returns two booleans - the first if "boundsChanged" the second is "sizeChanged".
     */
    _setCurrentLayoutBounds(left: number, top: number, right: number, bottom: number): { boundsChanged: boolean, sizeChanged: boolean } {
        this._isLayoutValid = true;
        let boundsChanged: boolean = this._oldLeft !== left || this._oldTop !== top || this._oldRight !== right || this._oldBottom !== bottom;
        let sizeChanged: boolean = (this._oldRight - this._oldLeft !== right - left) || (this._oldBottom - this._oldTop !== bottom - top);
        this._oldLeft = left;
        this._oldTop = top;
        this._oldRight = right;
        this._oldBottom = bottom;
        return { boundsChanged, sizeChanged };
    }

    // TODO: We need to implement some kind of build step that includes these members only when building for Android
    //@android
    public _context: android.content.Context;

    public _onAttached(context: android.content.Context) {
        //
    }

    public _onDetached(force?: boolean) {
        //
    }

    public _createUI() {
        //
    }

    public _onContextChanged() {
        //
    }
    //@endandroid

    // TODO: We need to implement some kind of build step that includes these members only when building for iOS

    //@endios

    public eachChild(callback: (child: ViewBase) => boolean): void {
        this._eachChildView(<any>callback);
    }

    public _eachChildView(callback: (view: ViewDefinition) => boolean) {
        //
    }

    _childIndexToNativeChildIndex(index?: number): number {
        return index;
    }

    _getNativeViewsCount(): number {
        return this._isAddedToNativeVisualTree ? 1 : 0;
    }

    _eachLayoutView(callback: (View) => void): void {
        return callback(this);
    }

    _addToSuperview(superview: any, index?: number): boolean {
        // IOS specific
        return false;
    }
    _removeFromSuperview(): void {
        // IOS specific
    }

    /**
     * Method is intended to be overridden by inheritors and used as "protected"
     */
    public _addViewCore(view: ViewBase, atIndex?: number) {
        if (view instanceof ViewCommon) {
            if (!view._isAddedToNativeVisualTree) {
                let nativeIndex = this._childIndexToNativeChildIndex(atIndex);
                view._isAddedToNativeVisualTree = this._addViewToNativeVisualTree(view, nativeIndex);
            }
        }

        super._addViewCore(view, atIndex);
    }

    /**
     * Method is intended to be overridden by inheritors and used as "protected"
     */
    public _removeViewCore(view: ViewBase) {
        if (view instanceof ViewCommon) {
            // TODO: Change type from ViewCommon to ViewBase. Probably this 
            // method will need to go to ViewBase class.
            // Remove the view from the native visual scene first
            this._removeViewFromNativeVisualTree(view);
        }
        super._removeViewCore(view);
    }

    // public unsetInheritedProperties(): void {
    //     // this._setValue(ProxyObject.bindingContextProperty, undefined, ValueSource.Inherited);
    //     // this._eachSetProperty((property) => {
    //     //     if (!(property instanceof styling.Property) && property.inheritable) {
    //     //         this._resetValue(property, ValueSource.Inherited);
    //     //     }
    //     //     return true;
    //     // });
    // }

    /**
     * Method is intended to be overridden by inheritors and used as "protected".
     */
    public _addViewToNativeVisualTree(view: ViewDefinition, atIndex?: number): boolean {
        if (view._isAddedToNativeVisualTree) {
            throw new Error("Child already added to the native visual tree.");
        }

        return true;
    }

    /**
     * Method is intended to be overridden by inheritors and used as "protected"
     */
    public _removeViewFromNativeVisualTree(view: ViewDefinition) {
        view._isAddedToNativeVisualTree = false;
    }

    public _updateLayout() {
        // needed for iOS.
    }

    get _nativeView(): any {
        return undefined;
    }

    public focus(): boolean {
        return undefined;
    }

    public getLocationInWindow(): Point {
        return undefined;
    }

    public getLocationOnScreen(): Point {
        return undefined;
    }

    public getLocationRelativeTo(otherView: ViewDefinition): Point {
        return undefined;
    }

    public getActualSize(): Size {
        let currentBounds = this._getCurrentLayoutBounds();
        if (!currentBounds) {
            return undefined;
        }

        return {
            width: layout.toDeviceIndependentPixels(currentBounds.right - currentBounds.left),
            height: layout.toDeviceIndependentPixels(currentBounds.bottom - currentBounds.top),
        }
    }

    public animate(animation: any): AnimationPromise {
        return this.createAnimation(animation).play();
    }

    public createAnimation(animation: any): any {
        animation.target = this;
        return new Animation([animation]);
    }

    public toString(): string {
        let str = this.typeName;
        if (this.id) {
            str += `<${this.id}>`;
        } else {
            str += `(${this._domId})`;
        }
        let source = Source.get(this);
        if (source) {
            str += `@${source};`;
        }

        return str;
    }

    public _setNativeViewFrame(nativeView: any, frame: any) {
        //
    }

    // public _onStylePropertyChanged(property: Property): void {
    //     //
    // }

    // protected _canApplyNativeProperty(): boolean {
    //     // Check for a valid _nativeView instance
    //     return !!this._nativeView;
    // }

    public _getValue(): never {
        throw new Error("The View._setValue is obsolete. There is a new property system.")
    }

    public _setValue(): never {
        throw new Error("The View._setValue is obsolete. There is a new property system.")
    }
}

export function getLengthEffectiveValue(param: Length): number {
    switch (param.unit) {
        case "px":
            return Math.round(param.value);

        default:
        case "dip":
            return Math.round(layout.getDisplayDensity() * param.value);
    }
}

function getPercentLengthEffectiveValue(prentAvailableLength: number, param: PercentLength): number {
    switch (param.unit) {
        case "%":
            return Math.round(prentAvailableLength * param.value);

        case "px":
            return Math.round(param.value);

        default:
        case "dip":
            return Math.round(layout.getDisplayDensity() * param.value);
    }
}

function updateChildLayoutParams(child: ViewCommon, parent: ViewCommon, density: number): void {
    let style = child.style;

    let parentWidthMeasureSpec = parent._currentWidthMeasureSpec;
    let parentWidthMeasureSize = layout.getMeasureSpecSize(parentWidthMeasureSpec);
    let parentWidthMeasureMode = layout.getMeasureSpecMode(parentWidthMeasureSpec);
    let parentAvailableWidth = parentWidthMeasureMode === layout.UNSPECIFIED ? -1 : parentWidthMeasureSize;
    style.effectiveWidth = getPercentLengthEffectiveValue(parentAvailableWidth, style.width);
    style.effectiveMarginLeft = getPercentLengthEffectiveValue(parentAvailableWidth, style.marginLeft);
    style.effectiveMarginRight = getPercentLengthEffectiveValue(parentAvailableWidth, style.marginRight);

    let parentHeightMeasureSpec = parent._currentHeightMeasureSpec;
    let parentHeightMeasureSize = layout.getMeasureSpecSize(parentHeightMeasureSpec);
    let parentHeightMeasureMode = layout.getMeasureSpecMode(parentHeightMeasureSpec);
    let parentAvailableHeight = parentHeightMeasureMode === layout.UNSPECIFIED ? -1 : parentHeightMeasureSize;
    style.effectiveHeight = getPercentLengthEffectiveValue(parentAvailableHeight, style.height);
    style.effectiveMarginTop = getPercentLengthEffectiveValue(parentAvailableHeight, style.marginTop);
    style.effectiveMarginBottom = getPercentLengthEffectiveValue(parentAvailableHeight, style.marginBottom);
}

interface Length {
    readonly unit: "dip" | "px";
    readonly value: number;
}

interface PercentLength {
    readonly unit: "%" | "dip" | "px";
    readonly value: number;
}

export namespace PercentLength {
    export function parse(value: string | Length): PercentLength {
        if (typeof value === "string") {
            let type: "%" | "dip" | "px";
            let numberValue = 0;
            let stringValue = value.trim();
            let percentIndex = stringValue.indexOf("%");
            if (percentIndex !== -1) {
                type = "%";
                // if only % or % is not last we treat it as invalid value.
                if (percentIndex !== (stringValue.length - 1) || percentIndex === 0) {
                    numberValue = Number.NaN;
                } else {
                    numberValue = parseFloat(stringValue.substring(0, stringValue.length - 1).trim()) / 100;
                }
            } else {
                if (stringValue.indexOf("px") !== -1) {
                    type = "px";
                    stringValue = stringValue.replace("px", "").trim();
                } else {
                    type = "dip";
                }

                numberValue = parseFloat(stringValue);
            }

            if (isNaN(numberValue) || !isFinite(numberValue)) {
                throw new Error(`Invalid value: ${value}`);
            }

            return {
                value: numberValue,
                unit: type
            }
        } else {
            return value;
        }
    }
    export function equals(a: PercentLength, b: PercentLength): boolean {
        return a.value == b.value && a.unit == b.unit;
    }
}

export namespace Length {
    export function parse(value: string | Length): Length {
        if (typeof value === "string") {
            let type: "dip" | "px";
            let numberValue = 0;
            let stringValue = value.trim();
            if (stringValue.indexOf("px") !== -1) {
                type = "px";
                stringValue = stringValue.replace("px", "").trim();
            } else {
                type = "dip";
            }

            numberValue = parseFloat(stringValue);

            if (isNaN(numberValue) || !isFinite(numberValue)) {
                throw new Error(`Invalid value: ${value}`);
            }

            return {
                value: numberValue,
                unit: type
            }
        } else {
            return value;
        }
    }

    export function equals(a: Length, b: Length): boolean {
        return a.value == b.value && a.unit == b.unit;
    }
}

export function booleanConverter(v: string): boolean {
    let lowercase = (v + '').toLowerCase();
    if (lowercase === "true") {
        return true;
    } else if (lowercase === "false") {
        return false;
    }

    throw new Error(`Invalid boolean: ${v}`);
}

export const automationTextProperty = new Property<ViewCommon, string>({ name: "automationText" });
automationTextProperty.register(ViewCommon);

export const originXProperty = new Property<ViewCommon, number>({ name: "originX", defaultValue: 0.5, valueConverter: (v) => parseFloat(v) });
originXProperty.register(ViewCommon);

export const originYProperty = new Property<ViewCommon, number>({ name: "originY", defaultValue: 0.5, valueConverter: (v) => parseFloat(v) });
originYProperty.register(ViewCommon);

export const isEnabledProperty = new Property<ViewCommon, boolean>({ name: "isEnabled", defaultValue: true, valueConverter: booleanConverter });
isEnabledProperty.register(ViewCommon);

export const isUserInteractionEnabledProperty = new Property<ViewCommon, boolean>({ name: "isUserInteractionEnabled", defaultValue: true, valueConverter: booleanConverter });
isUserInteractionEnabledProperty.register(ViewCommon);

export const zeroLength: Length = { value: 0, unit: "px" };

export function lengthComparer(x: Length, y: Length): boolean {
    return x.unit === y.unit && x.value === y.value;
}

export const minWidthProperty = new CssProperty<Style, Length>({
    name: "minWidth", cssName: "min-width", defaultValue: zeroLength, affectsLayout: isIOS, equalityComparer: lengthComparer,
    valueChanged: (target, newValue) => {
        target.effectiveMinWidth = getLengthEffectiveValue(newValue);
    }, valueConverter: Length.parse
});
minWidthProperty.register(Style);

export const minHeightProperty = new CssProperty<Style, Length>({
    name: "minHeight", cssName: "min-height", defaultValue: zeroLength, affectsLayout: isIOS, equalityComparer: lengthComparer,
    valueChanged: (target, newValue) => {
        target.effectiveMinHeight = getLengthEffectiveValue(newValue);
    }, valueConverter: Length.parse
});
minHeightProperty.register(Style);

const matchParent: Length = { value: -1, unit: "px" };

export const widthProperty = new CssProperty<Style, PercentLength>({ name: "width", cssName: "width", defaultValue: matchParent, affectsLayout: isIOS, equalityComparer: lengthComparer, valueConverter: PercentLength.parse });
widthProperty.register(Style);

export const heightProperty = new CssProperty<Style, PercentLength>({ name: "height", cssName: "height", defaultValue: matchParent, affectsLayout: isIOS, equalityComparer: lengthComparer, valueConverter: PercentLength.parse });
heightProperty.register(Style);

const marginProperty = new ShorthandProperty<Style>({
    name: "margin", cssName: "margin",
    getter: function (this: Style) { return `${this.marginTop} ${this.marginRight} ${this.marginBottom} ${this.marginLeft}`; },
    converter: convertToMargins
});
marginProperty.register(Style);

export const marginLeftProperty = new CssProperty<Style, PercentLength>({ name: "marginLeft", cssName: "margin-left", defaultValue: zeroLength, affectsLayout: isIOS, equalityComparer: lengthComparer, valueConverter: PercentLength.parse });
marginLeftProperty.register(Style);

export const marginRightProperty = new CssProperty<Style, PercentLength>({ name: "marginRight", cssName: "margin-right", defaultValue: zeroLength, affectsLayout: isIOS, equalityComparer: lengthComparer, valueConverter: PercentLength.parse });
marginRightProperty.register(Style);

export const marginTopProperty = new CssProperty<Style, PercentLength>({ name: "marginTop", cssName: "margin-top", defaultValue: zeroLength, affectsLayout: isIOS, equalityComparer: lengthComparer, valueConverter: PercentLength.parse });
marginTopProperty.register(Style);

export const marginBottomProperty = new CssProperty<Style, PercentLength>({ name: "marginBottom", cssName: "margin-bottom", defaultValue: zeroLength, affectsLayout: isIOS, equalityComparer: lengthComparer, valueConverter: PercentLength.parse });
marginBottomProperty.register(Style);

const paddingProperty = new ShorthandProperty<Style>({
    name: "padding", cssName: "padding",
    getter: function (this: Style) { return `${this.paddingTop} ${this.paddingRight} ${this.paddingBottom} ${this.paddingLeft}`; },
    converter: convertToPaddings
});
paddingProperty.register(Style);

export const paddingLeftProperty = new CssProperty<Style, Length>({
    name: "paddingLeft", cssName: "padding-left", defaultValue: zeroLength, affectsLayout: isIOS, equalityComparer: lengthComparer,
    valueChanged: (target, newValue) => {
        target.effectivePaddingLeft = getLengthEffectiveValue(newValue);
    }, valueConverter: Length.parse
});
paddingLeftProperty.register(Style);

export const paddingRightProperty = new CssProperty<Style, Length>({
    name: "paddingRight", cssName: "padding-right", defaultValue: zeroLength, affectsLayout: isIOS, equalityComparer: lengthComparer,
    valueChanged: (target, newValue) => {
        target.effectivePaddingRight = getLengthEffectiveValue(newValue);
    }, valueConverter: Length.parse
});
paddingRightProperty.register(Style);

export const paddingTopProperty = new CssProperty<Style, Length>({
    name: "paddingTop", cssName: "padding-top", defaultValue: zeroLength, affectsLayout: isIOS, equalityComparer: lengthComparer,
    valueChanged: (target, newValue) => {
        target.effectivePaddingTop = getLengthEffectiveValue(newValue);
    }, valueConverter: Length.parse
});
paddingTopProperty.register(Style);

export const paddingBottomProperty = new CssProperty<Style, Length>({
    name: "paddingBottom", cssName: "padding-bottom", defaultValue: zeroLength, affectsLayout: isIOS, equalityComparer: lengthComparer,
    valueChanged: (target, newValue) => {
        target.effectivePaddingBottom = getLengthEffectiveValue(newValue);
    }, valueConverter: Length.parse
});
paddingBottomProperty.register(Style);

export const verticalAlignmentProperty = new CssProperty<Style, string>({ name: "verticalAlignment", cssName: "vertical-align", defaultValue: "stretch", affectsLayout: isIOS });
verticalAlignmentProperty.register(Style);

export const horizontalAlignmentProperty = new CssProperty<Style, string>({ name: "horizontalAlignment", cssName: "horizontal-align", defaultValue: "stretch", affectsLayout: isIOS });
horizontalAlignmentProperty.register(Style);

interface Thickness {
    top: string,
    right: string,
    bottom: string,
    left: string
}

function parseThickness(value: string): Thickness {
    if (typeof value === "string") {
        let arr = value.split(/[ ,]+/);

        let top: string;
        let right: string;
        let bottom: string;
        let left: string;

        if (arr.length === 1) {
            top = arr[0];
            right = arr[0];
            bottom = arr[0];
            left = arr[0];
        }
        else if (arr.length === 2) {
            top = arr[0];
            bottom = arr[0];
            right = arr[1];
            left = arr[1];
        }
        else if (arr.length === 3) {
            top = arr[0];
            right = arr[1];
            left = arr[1];
            bottom = arr[2];
        }
        else if (arr.length === 4) {
            top = arr[0];
            right = arr[1];
            bottom = arr[2];
            left = arr[3];
        }
        else {
            throw new Error("Expected 1, 2, 3 or 4 parameters. Actual: " + value);
        }

        return {
            top: top,
            right: right,
            bottom: bottom,
            left: left
        }
    } else {
        return value;
    }
}

function convertToMargins(this: Style, value: string): [CssProperty<any, any>, any][] {
    let thickness = parseThickness(value);
    return [
        [marginTopProperty, Length.parse(thickness.top)],
        [marginRightProperty, Length.parse(thickness.right)],
        [marginBottomProperty, Length.parse(thickness.bottom)],
        [marginLeftProperty, Length.parse(thickness.left)]
    ];
}

function convertToPaddings(this: Style, value: string): [CssProperty<any, any>, any][] {
    let thickness = parseThickness(value);
    return [
        [paddingTopProperty, Length.parse(thickness.top)],
        [paddingRightProperty, Length.parse(thickness.right)],
        [paddingBottomProperty, Length.parse(thickness.bottom)],
        [paddingLeftProperty, Length.parse(thickness.left)]
    ];
}

export const rotateProperty = new CssProperty<Style, number>({ name: "rotate", cssName: "rotate", defaultValue: 0, valueConverter: (v) => parseFloat(v) });
rotateProperty.register(Style);

export const scaleXProperty = new CssProperty<Style, number>({ name: "scaleX", cssName: "scaleX", defaultValue: 1, valueConverter: (v) => parseFloat(v) });
scaleXProperty.register(Style);

export const scaleYProperty = new CssProperty<Style, number>({ name: "scaleY", cssName: "scaleY", defaultValue: 1, valueConverter: (v) => parseFloat(v) });
scaleYProperty.register(Style);

export const translateXProperty = new CssProperty<Style, number>({ name: "translateX", cssName: "translateX", defaultValue: 0, valueConverter: (v) => parseFloat(v) });
translateXProperty.register(Style);

export const translateYProperty = new CssProperty<Style, number>({ name: "translateY", cssName: "translateY", defaultValue: 0, valueConverter: (v) => parseFloat(v) });
translateYProperty.register(Style);

const transformProperty = new ShorthandProperty<Style>({
    name: "transform", cssName: "transform",
    getter: function (this: Style) {
        let scaleX = this.scaleX;
        let scaleY = this.scaleY;
        let translateX = this.translateX;
        let translateY = this.translateY;
        let rotate = this.rotate;
        let result = "";
        if (translateX !== 0 || translateY !== 0) {
            result += `translate(${translateX}, ${translateY}) `;
        }
        if (scaleX !== 1 || scaleY !== 1) {
            result += `scale(${scaleX}, ${scaleY}) `;
        }
        if (rotate !== 0) {
            result += `rotate (${rotate})`;
        }

        return result.trim();
    },
    converter: convertToTransform
});
transformProperty.register(Style);

function transformConverter(value: string): Object {
    if (value.indexOf("none") !== -1) {
        let operations = {};
        operations[value] = value;
        return operations;
    }

    let operations = {};
    let operator = "";
    let pos = 0;
    while (pos < value.length) {
        if (value[pos] === " " || value[pos] === ",") {
            pos++;
        }
        else if (value[pos] === "(") {
            let start = pos + 1;
            while (pos < value.length && value[pos] !== ")") {
                pos++;
            }
            let operand = value.substring(start, pos);
            operations[operator] = operand.trim();
            operator = "";
            pos++;
        }
        else {
            operator += value[pos++];
        }
    }
    return operations;
}

function convertToTransform(value: string): [CssProperty<any, any>, any][] {
    let newTransform = transformConverter(value);
    let array = [];
    let values: Array<string>;
    for (var transform in newTransform) {
        switch (transform) {
            case "scaleX":
                array.push([scaleXProperty, parseFloat(newTransform[transform])]);
                break;
            case "scaleY":
                array.push([scaleYProperty, parseFloat(newTransform[transform])]);
                break;
            case "scale":
            case "scale3d":
                values = newTransform[transform].split(",");
                if (values.length >= 2) {
                    array.push([scaleXProperty, parseFloat(values[0])]);
                    array.push([scaleYProperty, parseFloat(values[1])]);
                }
                else if (values.length === 1) {
                    array.push([scaleXProperty, parseFloat(values[0])]);
                    array.push([scaleYProperty, parseFloat(values[0])]);
                }
                break;
            case "translateX":
                array.push([translateXProperty, parseFloat(newTransform[transform])]);
                break;
            case "translateY":
                array.push([translateYProperty, parseFloat(newTransform[transform])]);
                break;
            case "translate":
            case "translate3d":
                values = newTransform[transform].split(",");
                if (values.length >= 2) {
                    array.push([translateXProperty, parseFloat(values[0])]);
                    array.push([translateYProperty, parseFloat(values[1])]);
                }
                else if (values.length === 1) {
                    array.push([translateXProperty, parseFloat(values[0])]);
                    array.push([translateYProperty, parseFloat(values[0])]);
                }
                break;
            case "rotate":
                let text = newTransform[transform];
                let val = parseFloat(text);
                if (text.slice(-3) === "rad") {
                    val = val * (180.0 / Math.PI);
                }
                array.push([rotateProperty, val]);
                break;
            case "none":
                array.push([scaleXProperty, 1]);
                array.push([scaleYProperty, 1]);
                array.push([translateXProperty, 0]);
                array.push([translateYProperty, 0]);
                array.push([rotateProperty, 0]);
                break;
        }
    }
    return array;
}

// Background properties.
export const backgroundInternalProperty = new CssProperty<Style, Background>({ name: "backgroundInternal", cssName: "_backgroundInternal", defaultValue: Background.default });
backgroundInternalProperty.register(Style);

let pattern: RegExp = /url\(('|")(.*?)\1\)/;
export const backgroundImageProperty = new CssProperty<Style, string>({
    name: "backgroundImage", cssName: "background-image", valueChanged: (target, oldValue, newValue) => {

        let style = target;
        let currentBackground = target.backgroundInternal;
        let url: string = newValue;
        let isValid = false;

        let match = url.match(pattern);
        if (match && match[2]) {
            url = match[2];
        }

        if (isDataURI(url)) {
            let base64Data = url.split(",")[1];
            if (typeof base64Data !== "undefined") {
                style.backgroundInternal = currentBackground.withImage(fromBase64(base64Data));
                isValid = true;
            } else {
                style.backgroundInternal, currentBackground.withImage(undefined);
            }
        }
        else if (isFileOrResourcePath(url)) {
            style.backgroundInternal = currentBackground.withImage(fromFileOrResource(url));
            isValid = true;
        }
        else if (url.indexOf("http") !== -1) {
            style["_url"] = url;
            style.backgroundInternal = currentBackground.withImage(undefined);
            fromUrl(url).then((r) => {
                if (style && style["_url"] === url) {
                    // Get the current background again, as it might have changed while doing the request.
                    currentBackground = target.backgroundInternal;
                    target.backgroundInternal = currentBackground.withImage(r);
                }
            });
            isValid = true;
        }

        if (!isValid) {
            style.backgroundInternal = currentBackground.withImage(undefined);
        }
    }
});
backgroundImageProperty.register(Style);

export const backgroundColorProperty = new CssProperty<Style, Color>({
    name: "backgroundColor", cssName: "background-color", valueChanged: (target, newValue) => {
        printUnregisteredProperties();
        let background = target.backgroundInternal;
        target.backgroundInternal = background.withColor(newValue);
    }, equalityComparer: Color.equals, valueConverter: (value) => new Color(value)
});
backgroundColorProperty.register(Style);

export const backgroundRepeatProperty = new CssProperty<Style, string>({
    name: "backgroundRepeat", cssName: "background-repeat", valueChanged: (target, newValue) => {
        let background = target.backgroundInternal;
        target.backgroundInternal = background.withRepeat(newValue);
    }
});
backgroundRepeatProperty.register(Style);

export const backgroundSizeProperty = new CssProperty<Style, string>({
    name: "backgroundSize", cssName: "background-size", valueChanged: (target, newValue) => {
        let background = target.backgroundInternal;
        target.backgroundInternal = background.withSize(newValue);
    }
});
backgroundSizeProperty.register(Style);

export const backgroundPositionProperty = new CssProperty<Style, string>({
    name: "backgroundPosition", cssName: "background-position", valueChanged: (target, newValue) => {
        let background = target.backgroundInternal;
        target.backgroundInternal = background.withPosition(newValue);
    }
});
backgroundPositionProperty.register(Style);

function isNonNegativeFiniteNumberConverter(value: string): number {
    let number = parseFloat(value);
    if (!isNonNegativeFiniteNumber(number)) {
        throw new Error("border-width should be Non-Negative Finite number.");
    }
    return number;
}

function parseBorderColor(value: string): { top: Color, right: Color, bottom: Color, left: Color } {
    let result: { top: Color, right: Color, bottom: Color, left: Color };
    if (value.indexOf("rgb") === 0) {
        result.top = result.right = result.bottom = result.left = new Color(value);
        return result;
    }

    let arr = value.split(/[ ,]+/);
    if (arr.length === 1) {
        let arr0 = new Color(arr[0]);
        result.top = arr0;
        result.right = arr0;
        result.bottom = arr0;
        result.left = arr0;
    }
    else if (arr.length === 2) {
        let arr0 = new Color(arr[0]);
        let arr1 = new Color(arr[1]);
        result.top = arr0;
        result.right = arr1;
        result.bottom = arr0;
        result.left = arr1;
    }
    else if (arr.length === 3) {
        let arr0 = new Color(arr[0]);
        let arr1 = new Color(arr[1]);
        let arr2 = new Color(arr[2]);
        result.top = arr0;
        result.right = arr1;
        result.bottom = arr2;
        result.left = arr1;
    }
    else if (arr.length === 4) {
        let arr0 = new Color(arr[0]);
        let arr1 = new Color(arr[1]);
        let arr2 = new Color(arr[2]);
        let arr3 = new Color(arr[3]);
        result.top = arr0;
        result.right = arr1;
        result.bottom = arr2;
        result.left = arr3;
    }
    else {
        throw new Error("Expected 1, 2, 3 or 4 parameters. Actual: " + value);
    }
}

// Border Color properties.
const borderColorProperty = new ShorthandProperty<Style>({
    name: "borderColor", cssName: "border-color",
    getter: function (this: Style) {
        if (Color.equals(this.borderTopColor, this.borderRightColor) &&
            Color.equals(this.borderTopColor, this.borderBottomColor) &&
            Color.equals(this.borderTopColor, this.borderLeftColor)) {
            return this.borderTopColor ? this.borderTopColor.toString() : "";
        } else {
            return `${this.borderTopColor} ${this.borderRightColor} ${this.borderBottomColor} ${this.borderLeftColor}`;
        }
    },
    converter: function (value: string) {
        let fourColors = parseBorderColor(value);
        return [
            [borderTopColorProperty, fourColors.top],
            [borderRightColorProperty, fourColors.right],
            [borderBottomColorProperty, fourColors.bottom],
            [borderLeftColorProperty, fourColors.left]
        ];
    }
})
borderColorProperty.register(Style);

export const borderTopColorProperty = new CssProperty<Style, Color>({
    name: "borderTopColor", cssName: "border-top-color", valueChanged: (target, newValue) => {
        let background = target.backgroundInternal;
        target.backgroundInternal = background.withBorderTopColor(newValue);
    }, equalityComparer: Color.equals, valueConverter: (value) => new Color(value)
});
borderTopColorProperty.register(Style);

export const borderRightColorProperty = new CssProperty<Style, Color>({
    name: "borderRightColor", cssName: "border-right-color", valueChanged: (target, newValue) => {
        let background = target.backgroundInternal;
        target.backgroundInternal = background.withBorderRightColor(newValue);
    }, equalityComparer: Color.equals, valueConverter: (value) => new Color(value)
});
borderRightColorProperty.register(Style);

export const borderBottomColorProperty = new CssProperty<Style, Color>({
    name: "borderBottomColor", cssName: "border-bottom-color", valueChanged: (target, newValue) => {
        let background = target.backgroundInternal;
        target.backgroundInternal = background.withBorderBottomColor(newValue);
    }, equalityComparer: Color.equals, valueConverter: (value) => new Color(value)
});
borderBottomColorProperty.register(Style);

export const borderLeftColorProperty = new CssProperty<Style, Color>({
    name: "borderLeftColor", cssName: "border-left-color", valueChanged: (target, newValue) => {
        let background = target.backgroundInternal;
        target.backgroundInternal = background.withBorderLeftColor(newValue);
    }, equalityComparer: Color.equals, valueConverter: (value) => new Color(value)
});
borderLeftColorProperty.register(Style);

// Border Width properties.
const borderWidthProperty = new ShorthandProperty<Style>({
    name: "borderWidth", cssName: "border-width",
    getter: function (this: Style) {
        if (Color.equals(this.borderTopColor, this.borderRightColor) &&
            Color.equals(this.borderTopColor, this.borderBottomColor) &&
            Color.equals(this.borderTopColor, this.borderLeftColor)) {
            return this.borderTopColor + "";
        } else {
            return `${this.borderTopColor} ${this.borderRightColor} ${this.borderBottomColor} ${this.borderLeftColor}`;
        }
    },
    converter: function (value: string) {
        let borderWidths = parseThickness(value);
        return [
            [borderTopWidthProperty, borderWidths.top],
            [borderRightWidthProperty, borderWidths.right],
            [borderBottomWidthProperty, borderWidths.bottom],
            [borderLeftWidthProperty, borderWidths.left]
        ];
    }
})
borderWidthProperty.register(Style);

export const borderTopWidthProperty = new CssProperty<Style, Length>({
    name: "borderTopWidth", cssName: "border-top-width", defaultValue: zeroLength, affectsLayout: isIOS, equalityComparer: lengthComparer,
    valueChanged: (target, newValue) => {
        let value = getLengthEffectiveValue(newValue);
        if (!isNonNegativeFiniteNumber(value)) {
            throw new Error(`border-top-width should be Non-Negative Finite number. Value: ${value}`);
        }
        target.effectiveBorderTopWidth = value;
        let background = target.backgroundInternal;
        target.backgroundInternal = background.withBorderTopWidth(value);
    }, valueConverter: Length.parse
});
borderTopWidthProperty.register(Style);

export const borderRightWidthProperty = new CssProperty<Style, Length>({
    name: "borderRightWidth", cssName: "border-right-width", defaultValue: zeroLength, affectsLayout: isIOS, equalityComparer: lengthComparer,
    valueChanged: (target, newValue) => {
        let value = getLengthEffectiveValue(newValue);
        if (!isNonNegativeFiniteNumber(value)) {
            throw new Error(`border-right-width should be Non-Negative Finite number. Value: ${value}`);
        }
        target.effectiveBorderRightWidth = value;
        let background = target.backgroundInternal;
        target.backgroundInternal = background.withBorderRightWidth(value);
    }, valueConverter: Length.parse
});
borderRightWidthProperty.register(Style);

export const borderBottomWidthProperty = new CssProperty<Style, Length>({
    name: "borderBottomWidth", cssName: "border-bottom-width", defaultValue: zeroLength, affectsLayout: isIOS, equalityComparer: lengthComparer,
    valueChanged: (target, newValue) => {
        let value = getLengthEffectiveValue(newValue);
        if (!isNonNegativeFiniteNumber(value)) {
            throw new Error(`border-bottom-width should be Non-Negative Finite number. Value: ${value}`);
        }
        target.effectiveBorderBottomWidth = value;
        let background = target.backgroundInternal;
        target.backgroundInternal = background.withBorderBottomWidth(value);
    }, valueConverter: Length.parse
});
borderBottomWidthProperty.register(Style);

export const borderLeftWidthProperty = new CssProperty<Style, Length>({
    name: "borderLeftWidth", cssName: "border-left-width", defaultValue: zeroLength, affectsLayout: isIOS, equalityComparer: lengthComparer,
    valueChanged: (target, newValue) => {
        let value = getLengthEffectiveValue(newValue);
        if (!isNonNegativeFiniteNumber(value)) {
            throw new Error(`border-left-width should be Non-Negative Finite number. Value: ${value}`);
        }
        target.effectiveBorderLeftWidth = value;
        let background = target.backgroundInternal;
        target.backgroundInternal = background.withBorderLeftWidth(value);
    }, valueConverter: Length.parse
});
borderLeftWidthProperty.register(Style);

// Border Radius properties.
const borderRadiusProperty = new ShorthandProperty<Style>({
    name: "borderRadius", cssName: "border-radius",
    getter: function (this: Style) {
        if (this.borderTopLeftRadius === this.borderTopRightRadius &&
            this.borderTopLeftRadius === this.borderBottomRightRadius &&
            this.borderTopLeftRadius === this.borderBottomLeftRadius) {
            return this.borderTopLeftRadius + "";
        } else {
            return `${this.borderTopLeftRadius} ${this.borderTopRightRadius} ${this.borderBottomRightRadius} ${this.borderBottomLeftRadius}`;
        }
    },
    converter: function (value: string) {
        let borderRadius = parseThickness(value);
        return [
            [borderTopLeftRadiusProperty, borderRadius.top],
            [borderTopRightRadiusProperty, borderRadius.right],
            [borderBottomRightRadiusProperty, borderRadius.bottom],
            [borderBottomLeftRadiusProperty, borderRadius.left]
        ];
    }
})
borderRadiusProperty.register(Style);

export const borderTopLeftRadiusProperty = new CssProperty<Style, number>({
    name: "borderTopLeftRadius", cssName: "border-top-left-radius", defaultValue: 0, affectsLayout: isIOS, valueChanged: (target, newValue) => {
        let background = target.backgroundInternal;
        target.backgroundInternal = background.withBorderTopLeftRadius(newValue);
    }, valueConverter: isNonNegativeFiniteNumberConverter
});
borderTopLeftRadiusProperty.register(Style);

export const borderTopRightRadiusProperty = new CssProperty<Style, number>({
    name: "borderTopRightRadius", cssName: "border-top-right-radius", defaultValue: 0, affectsLayout: isIOS, valueChanged: (target, newValue) => {
        let background = target.backgroundInternal;
        target.backgroundInternal = background.withBorderTopRightRadius(newValue);
    }, valueConverter: isNonNegativeFiniteNumberConverter
});
borderTopRightRadiusProperty.register(Style);

export const borderBottomRightRadiusProperty = new CssProperty<Style, number>({
    name: "borderBottomRightRadius", cssName: "border-bottom-right-radius", defaultValue: 0, affectsLayout: isIOS, valueChanged: (target, newValue) => {
        let background = target.backgroundInternal;
        target.backgroundInternal = background.withBorderBottomLeftRadius(newValue);
    }, valueConverter: isNonNegativeFiniteNumberConverter
});
borderBottomRightRadiusProperty.register(Style);

export const borderBottomLeftRadiusProperty = new CssProperty<Style, number>({
    name: "borderBottomLeftRadius", cssName: "border-bottom-left-radius", defaultValue: 0, affectsLayout: isIOS, valueChanged: (target, newValue) => {
        let background = target.backgroundInternal;
        target.backgroundInternal = background.withBorderBottomRightRadius(newValue);
    }, valueConverter: isNonNegativeFiniteNumberConverter
});
borderBottomLeftRadiusProperty.register(Style);

function isNonNegativeFiniteNumber(value: number): boolean {
    return isFinite(value) && !isNaN(value) && value >= 0;
}

let supportedPaths = ["rect", "circle", "ellipse", "polygon"];
function isClipPathValid(value: string): boolean {
    if (!value) {
        return true;
    }
    let functionName = value.substring(0, value.indexOf("(")).trim();
    return supportedPaths.indexOf(functionName) !== -1;
}

export const clipPathProperty = new CssProperty<Style, string>({
    name: "clipPath", cssName: "clip-path", valueChanged: (target, newValue) => {
        if (!isClipPathValid(newValue)) {
            throw new Error("clip-path is not valid.");
        }

        let background = target.backgroundInternal;
        target.backgroundInternal = background.withClipPath(newValue);
    }
});
clipPathProperty.register(Style);

function isFloatValueConverter(value: string): number {
    let newValue = parseFloat(value);
    if (isNaN(newValue)) {
        throw new Error(`Invalid value: ${newValue}`);
    }

    return newValue;
}

export const zIndexProperty = new CssProperty<Style, number>({ name: "zIndex", cssName: "z-index", defaultValue: 0, valueConverter: isFloatValueConverter });
zIndexProperty.register(Style);

function opacityConverter(value: any): number {
    let newValue = parseFloat(value);
    if (!isNaN(newValue) && 0 <= newValue && newValue <= 1) {
        return newValue;
    }

    throw new Error(`Opacity should be between [0, 1]. Value: ${newValue}`);
}

function isOpacityValid(value: string): boolean {
    let parsedValue: number = parseFloat(value);
    return !isNaN(parsedValue) && 0 <= parsedValue && parsedValue <= 1;
}

export const opacityProperty = new CssProperty<Style, number>({ name: "opacity", cssName: "opacity", defaultValue: 1, valueConverter: opacityConverter });
opacityProperty.register(Style);

export const colorProperty = new InheritedCssProperty<Style, Color>({ name: "color", cssName: "color", equalityComparer: Color.equals, valueConverter: (v) => new Color(v) });
colorProperty.register(Style);

export const fontInternalProperty = new CssProperty<Style, Font>({ name: "fontInternal", cssName: "_fontInternal", defaultValue: Font.default });

export const fontFamilyProperty = new InheritedCssProperty<Style, string>({
    name: "fontFamily", cssName: "font-family", valueChanged: (target, newValue) => {
        let currentFont = target.fontInternal;
        if (currentFont.fontFamily !== newValue) {
            target.fontInternal = currentFont.withFontFamily(newValue);
        }
    }
});
fontFamilyProperty.register(Style);

export const fontSizeProperty = new InheritedCssProperty<Style, number>({
    name: "fontSize", cssName: "font-size", valueChanged: (target, newValue) => {
        let currentFont = target.fontInternal;
        if (currentFont.fontSize !== newValue) {
            target.fontInternal = currentFont.withFontSize(newValue);
        }
    },
    valueConverter: (v) => parseFloat(v)
});
fontSizeProperty.register(Style);

export const fontStyleProperty = new InheritedCssProperty<Style, FontStyle>({
    name: "fontStyle", cssName: "font-style", defaultValue: FontStyle.NORMAL, valueConverter: FontStyle.parse, valueChanged: (target, newValue) => {
        let currentFont = target.fontInternal;
        if (currentFont.fontStyle !== newValue) {
            target.fontInternal = currentFont.withFontStyle(newValue);
        }
    }
});
fontStyleProperty.register(Style);

export const fontWeightProperty = new InheritedCssProperty<Style, FontWeight>({
    name: "fontWeight", cssName: "font-weight", defaultValue: FontWeight.NORMAL, valueConverter: FontWeight.parse, valueChanged: (target, newValue) => {
        let currentFont = target.fontInternal;
        if (currentFont.fontWeight !== newValue) {
            target.fontInternal = currentFont.withFontWeight(newValue);
        }
    }
});
fontWeightProperty.register(Style);

const fontProperty = new ShorthandProperty<Style>({
    name: "font", cssName: "font",
    getter: function (this: Style) {
        return `${this.fontStyle} ${this.fontWeight} ${this.fontSize} ${this.fontFamily}`;
    },
    converter: function (value: string) {
        let font = parseFont(value);
        let fontSize = fontSizeConverter(font.fontSize);

        return [
            [fontStyleProperty, font.fontStyle],
            [fontWeightProperty, font.fontWeight],
            [fontSizeProperty, fontSize],
            [fontFamilyProperty, font.fontFamily]
        ]
    }
})
fontProperty.register(Style);