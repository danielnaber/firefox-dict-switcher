
AddonManager.getAddonByID(self.options.id, function(aAddon) {
    unsafeWindow.gViewController.commands.cmd_showItemDetails.doCommand(aAddon, true);
});
