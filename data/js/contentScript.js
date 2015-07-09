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

// Note by Ashraf: I set this constant to 1 after it was 25 to enable continuous language guessing and try to
// provide best results to users
const minimum_character_length = 1;

// Variable to store user preferences
let userPreferences;

// Listen to a message from the main script containing user preferences
self.port.on("config", function (prefs)
{
    // We require the presence of user preferences just to know the languages for which the user chosen "Don't
    // detect this language" option so that we disable spell checking if we encountered text in these languages
    userPreferences = prefs;
});

function detectAndSetLanguage(targetElement, text)
{
    // If spell checking was disabled by the page developer, we honor the setting and don't set the value of
    // the spellcheck attribute to true, but we still try to detect the language and keep the ordinary operation
    // of the addon because the user can manually enable spell checking from the context menu, and the spellcheck
    // attribute stays false.
    // I set the developerDisabledSpellChecking to indicate this case
    // (see how the firefoxDictSwitcherDisabledSpellCheck flag is set later)
    // I use === because I'm not sure if this attribute accepts only booleans
    let developerDisabledSpellChecking = targetElement.spellcheck === false &&
                                         !targetElement.dataset.firefoxDictSwitcherDisabledSpellCheck;

    // text is an optional parameter used when handling the paste event only. Otherwise, we read the text from
    // the element itself
    text = text || targetElement.value || targetElement.textContent;

    // we are only going to check language if there is some amount of text available as
    // that will increase our chances of detecting language correctly.
    if(text.length > minimum_character_length)
    {
        //let startTime = performance.now();

        // Looks like we have enough text to reliably detect the language.
        guessLanguage.detect(text, function (language)
        {
            // The index of the dash character (-) in the language code (ex for en-US this will be 2)
            let dashIndex = language.indexOf("-"),
                languageOnlyCode = dashIndex < 0 ? language : language.substr(0, dashIndex);

            //console.log(`Detected language code is (${language}) in ${performance.now() - startTime} ms`);

            // If the language wasn't successfully identified, or the user chose to not detect the detected
            // language (see the configs in package.json)
            if(language == "unknown" || userPreferences[languageOnlyCode] == "-")
            {
                // Disable spell checking�
                targetElement.spellcheck = false;

                // �send null to indicate that to the main script�
                self.port.emit("changeDictionary", null);

                // �and set a flag to indicate that it's our code who disabled spell checking not the page developer's
                // We do so only if the attribute wasn't already set to false be the page developer
                if(!developerDisabledSpellChecking)
                    targetElement.dataset.firefoxDictSwitcherDisabledSpellCheck = "1";
            }
            else
            {
                // If the language was detected successfully enable specll checking and send its code to the main script
                if(!developerDisabledSpellChecking)
                {
                    // We enable spell checking only if the attribute wasn't already set to false be the page developer
                    targetElement.spellcheck = true;
                }

                self.port.emit("changeDictionary", language);
            }
        });
    }
    else
    {
        // Because we can't detect the language, disable spell checking
        targetElement.spellcheck = false;

        // Sending null to the main script also indicates that the input text is too short to detect the language
        self.port.emit("changeDictionary", null);

        // And set a flag to indicate that it's our code who disabled spell checking not the page developer's
        // We do so only if the attribute wasn't already set to false be the page developer
        if(!developerDisabledSpellChecking)
            targetElement.dataset.firefoxDictSwitcherDisabledSpellCheck = "1";
    }
}

function isEligible(element)
{
    // The addon operates only on textarea elements or elements with the contenteditable attribute set
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
        if(key == 32/*space*/ || key == 188/*comma*/ || key == 190/*dot*/)
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