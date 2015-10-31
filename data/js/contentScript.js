// Automatic Dictionary Switcher Add-on for Firefox
// Copyright 2015 Daniel Naber
//
// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
// If a copy of the MPL was not distributed with this file, You can obtain one at
// http://mozilla.org/MPL/2.0/.

function isEligible(element) {
    // The addon operates only on textarea elements or elements with the contentEditable attribute set.
    // If the body itself is contentEditable we have to give up, as that would mean we put our feedback
    // div in the editable area and that causes a mess (happened on languagetool.org, where the text
    // area is a contentEditable body inside an iframe):
    return element.tagName == "TEXTAREA" ||
          (element.isContentEditable && element.tagName != "BODY");
}

// Note from Ashraf: I commented the old code that initially iterates over all TEXTAREA elements and instead
// used event delegation by attaching event handlers only to the root element. This is better for performance
// and covers the elements that are later appended to the DOM
document.documentElement.addEventListener("keydown", function (evt) {
    if(isEligible(evt.target)) {
        var key = evt.keyCode || evt.charCode;
        // check if user has finished entering a word
        if(key == 32/*space*/ || key == 188/*comma*/ || key == 190/*dot*/) {
            let text = evt.target.value || evt.target.textContent;
            self.port.emit("detectLanguage", text);
        }
    }
});

// HACK: The focus event doesn't bubble, so I set the useCapture parameter of addEventListener to true.
// We should use the focusin event which bubbles but it's not supported on Firefox as of the date I wrote this.
// See the note on this article https://developer.mozilla.org/en-US/docs/Web/Events/focusin
document.documentElement.addEventListener("focus", function (evt) {
    // Set correct language when we set the focus to already filled textarea
    if(isEligible(evt.target)) {
        let text = evt.target.value || evt.target.textContent;
        self.port.emit("detectLanguage", text);
    }
}, true);

document.documentElement.addEventListener("paste", function (e) {
    // We act only when data is pasted on a TEXTAREA element
    if(isEligible(e.target)) {
        // We try to detect only if the pasted data is available in plain text format
        let text = e.clipboardData.getData("text/plain");
        if(text) {
            self.port.emit("detectLanguage", text);
        }
    }
});
