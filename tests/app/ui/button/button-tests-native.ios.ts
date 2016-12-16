﻿import * as buttonModule from "ui/button";
import * as colorModule from "color";
import * as utilsModule from "utils/utils";
import * as enums from "ui/enums";

export function getNativeText(button: buttonModule.Button): string {
    return button.ios.titleForState(UIControlState.Normal);
}

export function getNativeTextWrap(button: buttonModule.Button): boolean {
    return (<UIButton>button.ios).titleLabel.lineBreakMode === NSLineBreakMode.ByWordWrapping;
}

export function getNativeFontSize(button: buttonModule.Button): number {
    return button.ios.titleLabel.font.pointSize;
}

export function getNativeColor(button: buttonModule.Button): colorModule.Color {
    return utilsModule.ios.getColor(button.ios.titleColorForState(UIControlState.Normal));
}

export function getNativeBackgroundColor(button: buttonModule.Button): colorModule.Color {
    return utilsModule.ios.getColor(button.ios.backgroundColor);
}

export function getNativeTextAlignment(button: buttonModule.Button): string {
    switch (button.ios.titleLabel.textAlignment) {
        case NSTextAlignment.Left:
            return enums.TextAlignment.left;
        case NSTextAlignment.Center:
            return enums.TextAlignment.center;
        case NSTextAlignment.Right:
            return enums.TextAlignment.right;
        default:
            return "unexpected value";
    }
}

export function performNativeClick(button: buttonModule.Button): void {
    button.ios.sendActionsForControlEvents(UIControlEvents.TouchUpInside);
}
