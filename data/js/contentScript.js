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

document.addEventListener('DOMContentLoaded', initialize);
