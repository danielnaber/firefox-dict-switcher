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

var minimum_character_length = 25;

function handleKeyDown(evt) {
    var key = evt.keyCode || evt.charCode;

    // check if user has finished entering a word
    if (key == 32) {
        // we are only going to check language if there is some amount of text available as
        // that will increase our chances of detecting language correctly.
        if (evt.target.value.length > minimum_character_length) {
            // Looks like we have enough text to reliably detect the language.
            guessLanguage.detect(evt.target.value, function(language) {

                // lets set the language as the one that we have detected
                evt.target.lang = language;

                // Tell the main script to switch dictionary to the one that is there for this language.
                self.port.emit("changeDictionary", language);

                // now lets reset the spell checker so that it will check based on the detected language.
                evt.target.spellcheck = false;
                evt.target.spellcheck = true;
            });
        }
    }
}

function initialize(){
    var textareas = document.querySelectorAll("textarea");
    
    for (var i = 0; i < textareas.length; i++ ) {
        textareas[i].addEventListener('keydown', handleKeyDown);
    }
}

initialize();
