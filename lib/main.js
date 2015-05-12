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

const {Cc, Ci} = require("chrome");
var ss = require("sdk/simple-storage");
var pageMod = require("sdk/page-mod");
var data = require("sdk/self").data;
var panel = require("sdk/panel");
var sp = require("sdk/simple-prefs");
var ss = require("sdk/simple-storage");
var spellchecker;
var dictpreference;

function showPanel() {

}

// this function will parse the available dictionaries and will categorises them on the basis of the language names.
function parseAvailableDictionaries() {
    if (dictpreference.available_languages === undefined){
        dictpreference.available_languages = [];
    }

    for (var i = 0; i < dictpreference.available_dictionaries.length; i++){
        var dialect = dictpreference.available_dictionaries[i];
        var language;
        if (dialect.length == 2) {
            language = dialect;
        } else {
            var language = dialect.substr(0,2);
        }
        
        
        if (dictpreference.available_languages.indexOf(language) == -1){
            dictpreference.available_languages.push(language);
        }

        if (dictpreference[language] === undefined ){
            dictpreference[language] = [];
        }

        dictpreference[language].push(dialect);
    }
}

function initializeDictPreference() {
    if (ss.storage.dictpreference !== undefined) {
        dictpreference = ss.storage.dictpreference;
    } else {
        var dictArrayContainer = new Object();
        var dictArrayLengthContainer = new Object();
        dictpreference = new Object();
        dictpreference.preferenceList = [];

        spellchecker.getDictionaryList(dictArrayContainer, dictArrayLengthContainer);
        
        dictpreference.available_dictionaries = dictArrayContainer.value;
        parseAvailableDictionaries();
        ss.storage.dictpreference = dictpreference;
    }
}

// This function will be responsible for setting up the dictionary
function changeDictionary(language) {
    var dictionary = "";
    // Check if we are able to detect both language and dialect. If yes do we have a dictionary for it
    if (language.length == 5 && dictpreference.available_dictionaries.indexOf(language) != -1) {
        dictionary = language;
    }

    // Check if the user has set any preference for the detected language
    if (dictpreference.preferenceList.indexOf(language) != -1) {
        dictionary = dictpreference["pref_" + language];
    } else if (dictpreference[language] !== undefined && dictpreference[language].length > 0){
    // if we don't have a preference set and we have one or more dictionary for the detected language
    // then select the first available dictionary for that language
        dictionary = dictpreference[language][0];
    }

    // Finally, lets set the selected dictionary
    spellchecker.dictionary = dictionary;
}

function initialize(options) {
    // add the script to all pages that will be responsible for detecting the language
    pageMod.PageMod({
            include: [
                "http://*",
                "https://*",
                "file://*"
            ],
            contentScriptWhen: 'end',
            contentScriptFile: [
                data.url("js/_languageData.js"), 
                data.url("js/guessLanguage.js"),
                data.url("js/contentScript.js")
            ],
            onAttach: function(worker) {
                worker.port.on("changeDictionary", changeDictionary);
            }
    });

    //initialize the spell checker
    spellchecker = Cc["@mozilla.org/spellchecker/engine;1"].getService(Ci.mozISpellCheckingEngine);
    initializeDictPreference();

    //display the preference panel when user clicks the edit dictionary preference button
    sp.on("editPreferedDictionary", showPanel);
}

exports.main = function (options, callbacks) {
    initialize(options);
};
