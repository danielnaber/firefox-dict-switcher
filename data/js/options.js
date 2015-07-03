function initialize(preferences)
{
    var template = document.querySelector("template"),
        label = template.content.querySelector("label"),
        dropDown = template.content.querySelector("select"),
        content = document.querySelector("section");

    for(var languageCode in preferences)
    {
        var languageSettings = preferences[languageCode];

        // See parseAvailableDictionaries in main.js to know how this array is constructed
        label.textContent = languageSettings[0]; // Friendly language name
        label.for = languageCode;
        dropDown.id = languageCode;
        dropDown.innerHTML = "";

        // Always append an empty element so that the user can let the preference blank
        dropDown.appendChild(document.createElement("option"));

        for(var i = 1; i < languageSettings.length; i++)
        {
            var domOption = document.createElement("option"),
                setting = languageSettings[i];

            domOption.value = setting.code;
            domOption.textContent = setting.name;

            if(setting.isPreferred)
                domOption.setAttribute("selected", "selected");

            dropDown.appendChild(domOption);
        }

        content.appendChild(document.importNode(template.content, true));
    }

    var buttons = document.querySelectorAll("button");

    // The ok button
    buttons[0].addEventListener("click", function ()
    {
        var storagePrefs = {};

        for(var languageCode in preferences)
            storagePrefs[languageCode] = document.getElementById(languageCode).value;

        self.port.emit("close", storagePrefs);
    });

    // The cancel button
    buttons[1].addEventListener("click", function ()
    {
        self.port.emit("close", null);
    });
}

self.port.on("init", initialize);