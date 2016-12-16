﻿import * as pages from "ui/page";
import * as textField from "ui/text-field";
import * as observable from "data/observable";

var context: any;
var closeCallback: Function;

var page: pages.Page;
var usernameTextField: textField.TextField;
var passwordTextField: textField.TextField;

export function onShownModally(args: pages.ShownModallyData) {
    console.log("login-page.onShownModally, context: " + args.context);
    context = args.context;
    closeCallback = args.closeCallback;
}

export function onLoaded(args: observable.EventData) {
    console.log("login-page.onLoaded");
    page = <pages.Page>args.object;
    usernameTextField = page.getViewById<textField.TextField>("username");
    passwordTextField = page.getViewById<textField.TextField>("password");
}

export function onUnloaded() {
    console.log("login-page.onUnloaded");
}

export function onLoginButtonTap() {
    console.log("login-page.onLoginButtonTap");
    closeCallback(usernameTextField.text, passwordTextField.text);
}