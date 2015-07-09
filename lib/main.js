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
const chromeModule  = require("chrome"),
      classes       = chromeModule.Cc,
      interfaces    = chromeModule.Ci,
      utilities     = chromeModule.Cu,
      pageMod       = require("sdk/page-mod"),
      data          = require("sdk/self").data,
      simplePrefs   = require("sdk/simple-prefs"),
      spellchecker  = classes["@mozilla.org/spellchecker/engine;1"].getService(interfaces.mozISpellCheckingEngine),
      tabs          = require("sdk/tabs");

let parsedDictionaries,
    preferenceList,
    availableDictionaries,
    appLocale;

utilities.import("resource://gre/modules/Services.jsm");

// TODO: There should be a better way to get the app locale
appLocale = Services.locale.getApplicationLocale().getCategory("NSILOCALE_MESSAGES");

function showPanel(e)
{
    tabs.open({
        url: data.url("ui/options.html"),
        onLoad: function (tab)
        {
            var worker = tab.attach({
                contentScriptFile: data.url("js/options.js")
            });

            worker.port.emit("init", parsedDictionaries);

            worker.port.on("close", function (preferences)
            {
                tab.close();

                // The preferences object will have a value only if the user clicked "Ok" in the preferences
                // page. See options.js
                if(preferences)
                {
                    for(var i in preferences)
                    {
                        parsedDictionaries[i].forEach(function (langElem)
                        {
                            langElem.isPreferred = langElem.code == preferences[i];
                        })
                    }
                }

                savePreferences(preferences);
            });
        }
    });
}

function LanguageElement(code, name, isPreferred)
{
    this.code        = code;
    this.name        = name;
    this.isPreferred = isPreferred;
}

function getPreferences()
{
    // See https://developer.mozilla.org/en-US/Add-ons/SDK/High-Level_APIs/simple-prefs#prefs
    // See package.json
    let prefs = simplePrefs.prefs.preferences;

    // If the user haven't configure the plugin before, the setting value will be null (or an empty string?), so
    // we'll return an empty object
    if(!prefs)
        return {};

    // Otherwise, we'll parse the settings JSON and return the resulting object
    // The preferences object will has a property name for each available language with the value set to the dialect
    // selected by the user. Example object may be
    // { "en": "en-NZ", "de": "de-LU", "ar": "ar-EG" }
    return JSON.parse(prefs);
}

function savePreferences(prefs)
{
    // See https://developer.mozilla.org/en-US/Add-ons/SDK/High-Level_APIs/simple-prefs#prefs
    // See package.json
    simplePrefs.prefs.preferences = JSON.stringify(prefs);
}

// this function will parse the available dictionaries and will categorise them on the basis of the language names.
function parseAvailableDictionaries()
{
    // See http://stackoverflow.com/q/31008278/95970
    let languagesNamesBundle = Services.strings.createBundle("chrome://global/locale/languageNames.properties"),
        countriesNamesBundle = Services.strings.createBundle("chrome://global/locale/regionNames.properties"),
        userPreferences      = getPreferences();

    parsedDictionaries = {};

    for(let i = 0; i < availableDictionaries.length; i++)
    {
        // The code of the dictionary as is returned from the Mozilla spell checking service. Example codes are:
        // en, fr-FR, ja, de-LU
        let dialect = availableDictionaries[i],
            // The language code only. If we have a dictionary code of -for example- de-LU, we split it and store the
            // language code de in this variable
            language,
            // The friendly language name localized per the user culture. This is displayed in the UI. Examples are:
            // English, French, Dutch
            languageName,
            // This is the friendly full dictionary name including country name if available. Examples are:
            // English (United States), German (Luxomborg)
            dictionaryName;

        // TODO: Wrap all the calls to GetStringFromName into try/catch as it throws exceptions if the string
        // is not found

        // This is the case when we have a generic language with no country code (dialect) specified. For example:
        // en, fr, js, etc.
        if(dialect.length == 2)
        {
            language = dialect;

            // Get language name using language code
            dictionaryName = languageName = languagesNamesBundle.GetStringFromName(language);
        }
        else
        {
            // This is the case when we have both language and country codes, such as en-GB, de-LU
            // We split the language code into the language variable, and use the country code to fetch the country
            // name using the countriesNamesBundle
            language = dialect.substr(0, 2);
            languageName = languagesNamesBundle.GetStringFromName(language);
            dictionaryName = languageName +
                             " (" +
                             countriesNamesBundle.GetStringFromName(dialect.substr(3).toLowerCase()) +
                             ")";
        }

        if(!parsedDictionaries[language])
            parsedDictionaries[language] = [languageName]; // We always initialize the first element to the name of the language

        parsedDictionaries[language].push(new LanguageElement(dialect, dictionaryName, userPreferences[language] == dialect));
    }
}

function initializeDictPreference()
{
    let dictArrayContainer       = {},
        dictArrayLengthContainer = {};
    
    spellchecker.getDictionaryList(dictArrayContainer, dictArrayLengthContainer);

    availableDictionaries = dictArrayContainer.value;

    parseAvailableDictionaries();
}

// This function will be responsible for setting up the dictionary
function changeDictionary(language)
{
    // Exit if the script failed to detect the language
    if(!language)
        return;

    let dictionary = "";

    // Check if we are able to detect both language and dialect. If yes do we have a dictionary for it
    if(language.length >= 5 && availableDictionaries.indexOf(language) != -1)
        dictionary = language;
    else
    {
        let languageData = parsedDictionaries[language];

        // If the language detection library detected a language for which the user has no dictionary (because of a
        // fault of the library or because the user input some gibberish in some foreign language) we set spell checking
        // language to an empty string and let Firefox select the default dictionary
        if(!languageData)
            spellchecker.dictionary = "";
        else
        {
            let preferredDictionary = languageData.find(function (dict)
            {
                return dict.isPreferred;
            });

            // If we find a preferred dictionary (as per what the user configured) use it, otherwise, use the first
            // dictionary in the list for this language
            if(preferredDictionary)
                spellchecker.dictionary = preferredDictionary.code;
            else
                spellchecker.dictionary = languageData[1].code;
        }
    }
    
}

function initialize(options)
{
    // add the script to all pages that will be responsible for detecting the language
    pageMod.PageMod({
        include: [
            "http://*",
            "https://*",
            "file://*"
        ],
        contentScriptWhen: "end",
        contentScriptFile: [
            data.url("js/_languageData.js"),
            data.url("js/guessLanguage.js"),
            data.url("js/contentScript.js")
        ],
        onAttach: function (worker)
        {
            worker.port.on("changeDictionary", changeDictionary);
        }
    });

    initializeDictPreference();

    // Display the preference panel when user clicks the edit dictionary preference button
    simplePrefs.on("editPreferedDictionary", showPanel);
}

exports.main = function (options, callbacks)
{
    initialize(options);
};