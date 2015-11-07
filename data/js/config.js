
// open the add-ons configuration (from http://stackoverflow.com/questions/22593454/):
AddonManager.getAddonByID(self.options.id, function(aAddon) {
    unsafeWindow.gViewController.commands.cmd_showItemDetails.doCommand(aAddon, true);
});
