// Automatic Dictionary Switcher Add-on for Firefox
// Copyright 2015 Daniel Naber
//
// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
// If a copy of the MPL was not distributed with this file, You can obtain one at
// http://mozilla.org/MPL/2.0/.

var main = require("./main");

exports["test main 1"] = function(assert) {
  main.initializeDictPreference();
  var dicts = main.parseAvailableDictionaries();
  assert.ok(Object.keys(dicts).length > 0, "got available dictionaries");
};

require("sdk/test").run(exports);
