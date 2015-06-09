//          Copyright 2015 Daniel Naber
//
//   Licensed under the Apache License, Version 2.0 (the "License");
//   you may not use this file except in compliance with the License.
//   You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
//   Unless required by applicable law or agreed to in writing, software
//   distributed under the License is distributed on an "AS IS" BASIS,
//   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//   See the License for the specific language governing permissions and
//   limitations under the License.

const minimum_character_length = 25;

function detectAndSetLanguage(targetElement, text)
{
    // text is an optional parameter used when handling the paste event only. Otherwise, we read the text from
    // the element itself
    text = text || targetElement.value || targetElement.textContent;

    // we are only going to check language if there is some amount of text available as
    // that will increase our chances of detecting language correctly.
    if(text.length > minimum_character_length)
    {
        let startTime = performance.now();

        // Looks like we have enough text to reliably detect the language.
        guessLanguage.detect(text, function (language)
        {
            console.log(`Detected language code is (${language}) in ${performance.now() - startTime} ms`);

            // lets set the language as the one that we have detected
            targetElement.lang = language;

            // Tell the main script to switch dictionary to the one that is there for this language.
            self.port.emit("changeDictionary", language);

            // now lets reset the spell checker so that it will check based on the detected language.
            // targetElement.spellcheck = false;
            // targetElement.spellcheck = true;
        });
    }
}

function isEligible(element)
{
    return element.tagName == "TEXTAREA" ||
           element.contentEditable;
}

// Note from Ashraf: I commented the old code that initially iterates over all TEXTAREA elements and instead
// used event delegation by attaching event handlers only to the root element. This is better for performance
// and covers the elements that are later appended to the DOM
document.documentElement.addEventListener("keydown", function (evt)
{
    if(isEligible(evt.target))
    {
        var key = evt.keyCode || evt.charCode;

        // check if user has finished entering a word
        if(key == 32)
        {
            detectAndSetLanguage(evt.target);
        }
    }
});

// HACK: The focus event doesn't bubble, so I set the useCapture parameter of addEventListener to true.
// We should use the focusin event which bubbles but it's not supported on Firefox as of the date I wrote this.
// See the note on this article https://developer.mozilla.org/en-US/docs/Web/Events/focusin
document.documentElement.addEventListener("focus", function (evt)
{
    // Set correct language when we set the focus to already filled textarea
    if(isEligible(evt.target))
        detectAndSetLanguage(evt.target);
}, true);

document.documentElement.addEventListener("paste", function (e)
{
    // We act only when data is pasted on a TEXTAREA element
    if(isEligible(e.target))
    {
        // We try to detect only if the pasted data is available in plain text format
        let text = e.clipboardData.getData("text/plain");

        if(text)
            detectAndSetLanguage(e.target, text);
    }
});