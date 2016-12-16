﻿import * as view from "ui/core/view";
import * as label from "ui/label";
import * as button from "ui/button";
import * as textField from "ui/text-field";
import * as textView from "ui/text-view";

export function changeTextButonTap(args) {
    var btnChange = <button.Button>args.object;
    var lbl = <label.Label>btnChange.parent.getViewById("Label");
    var btn = <button.Button>btnChange.parent.getViewById("Button");
    var textField = <textField.TextField>btnChange.parent.getViewById("TextField");
    var textView = <textView.TextView>btnChange.parent.getViewById("TextView");
    
    if(lbl.text === "Change text") {
        lbl.text = btn.text = textField.text = textView.text = "Text changed";
    } else {
        lbl.text = btn.text = textField.text = textView.text = "Change text";
    }
}

export function butonTap(args) {
    var btnChange = <view.View>args.object;
    var lbl = <label.Label>btnChange.parent.getViewById("Label");
    var btn = <button.Button>btnChange.parent.getViewById("Button");
    var textField = <textField.TextField>btnChange.parent.getViewById("TextField");
    var textView = <textView.TextView>btnChange.parent.getViewById("TextView");

    if (lbl.style.textTransform === "none") {
        lbl.style.textTransform = "capitalize";
        btn.style.textTransform = "capitalize";
        textField.style.textTransform = "capitalize";
        textView.style.textTransform = "capitalize";
    } else if (lbl.style.textTransform === "capitalize") {
        lbl.style.textTransform = "uppercase";
        btn.style.textTransform = "uppercase";
        textField.style.textTransform = "uppercase";
        textView.style.textTransform = "uppercase";
    } else if (lbl.style.textTransform === "uppercase") {
        lbl.style.textTransform = "lowercase";
        btn.style.textTransform = "lowercase";
        textField.style.textTransform = "lowercase";
        textView.style.textTransform = "lowercase";
    } else if (lbl.style.textTransform === "lowercase") {
        lbl.style.textTransform = "none";
        btn.style.textTransform = "none";
        textField.style.textTransform = "none";
        textView.style.textTransform = "none";
    }
}
