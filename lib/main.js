//const {Cc, Ci} = require("chrome");
var ss = require("sdk/simple-storage");
var pageMod = require("sdk/page-mod");
var data = require("sdk/self").data;
var spellchecker;

//// This function will be responsible for setting up the dictionary
//function changeDictionary(language) {
//}

function initialize(options) {
    // add the script to all pages that will be responsible for detecting the language
    pageMod.PageMod({
            include: [
                "http://*",
                "https://*",
                "file://*"
            ],
            contentScriptWhen: 'ready',
            contentScriptFile: [
                data.url("js/_languageData.js"), 
                data.url("js/guessLanguage.js"),
                data.url("js/contentScript.js")
            ],
            onAttach: function(worker) {
                worker.port.on("changeDictionary", changeDictionary);
            }
    });

//    //initialize the spell checker
//    spellchecker = Cc["@mozilla.org/spellchecker/engine;1"].getService(Ci.mozISpellCheckingEngine);
}

exports.main = function (options, callbacks) {
    initialize(options);
};
