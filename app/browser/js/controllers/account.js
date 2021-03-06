app.controller("AccountsController", function($scope, $rootScope, $localStorage, $sessionStorage, Gw2Service) {
    $scope.editModeActive = false;

    $scope.addAccount = function(account) {
        if($scope.useEncryption()) {
            account.password = AES.encrypt(account.password, $sessionStorage.masterPassword);

            if(account.apikey) {
                account.apikey = AES.encrypt(account.apikey, $sessionStorage.masterPassword);
            }
        }

        account.added = new Date();
        account.lastUsage = new Date();

        $scope.accounts.push(account);
        $scope.updateAccountInformations(account);
    };

    $scope.accountItemClicked = function(account) {

        if(!$scope.editModeActive) {

            // if game is running don't start another instance
            if(!$scope.gameRunning) {
                // log in as usually
                account.lastUsage = new Date();
                $scope.login(account.email, account.password, account.addparams);
            }
        } else {
            // open edit dialog for the account
            $scope.editAcc = angular.copy(account);
            $scope.editAcc._account = account;
            $scope.editAcc.password = $scope.decrypt($scope.editAcc.password);

            if($scope.editAcc.apikey) {
                $scope.editAcc.apikey = $scope.decrypt($scope.editAcc.apikey);
            }

            $scope.checkApiKey();

            $scope.editAccountDialog.showModal();
        }
    };

    $scope.canUseWallet = function(account) {
        return account.permissions != undefined && account.permissions.indexOf("wallet") > -1;
    };

    $scope.canUsePvP = function(account) {
        return account.permissions != undefined && account.permissions.indexOf("pvp") > -1;
    }

    $scope.accountImage = function(account) {
        // can use pvp rank icons
        if($scope.canUsePvP(account) && account.pvprank != undefined) {
            var rank = Math.floor(account.pvprank / 10);

            return "assets/ranks/" + rank + ($scope.gameRunning ? "-locked" : "")+ ".png";
        }

        if($scope.gameRunning) {
            return "assets/acclocked.png";
        }

        return "assets/acc.png";
    };

    $scope.sortAccounts = function(account) {
        if($scope.configs().sortAccountsByLastUsage) {
            return -(new Date(account.lastUsage).getTime());
        }

        return new Date(account.created).getTime();
    };

    $scope.closeEditAccountWindow = function() {
        $scope.editAcc = {};
        $scope.editAccountDialog.close();
    };

    $scope.submitEditAccountDialog = function() {
        var account = $scope.editAcc._account;

        account.email = $scope.editAcc.email;
        account.password = AES.encrypt($scope.editAcc.password, $sessionStorage.masterPassword);

        if($scope.editAcc.apikey) {
            account.apikey = AES.encrypt($scope.editAcc.apikey, $sessionStorage.masterPassword);
        } else {
            if(account.apikey) {
                // user removed the apikey so the old account also shouldn't have it anymore
                juicy.log("user removed apikey from old account, removing it");
                delete account.apikey;
            }
        }

        account.addparams = $scope.editAcc.addparams;

        // apikey might have changed so update account informations
        $scope.updateAccountInformations(account);

        $localStorage.accounts = $scope.accounts;

        $scope.editAccountDialog.close();
    };

    $scope.deleteAccount = function() {
        var account = $scope.editAcc._account;

        if(window.confirm("Are you sure that you want to delete this account?")) {
            var index = $scope.accounts.indexOf(account);

            $scope.accounts.splice(index, 1);

            $localStorage.accounts = $scope.accounts;

            $scope.closeEditAccountWindow();
        }
    };

    $scope.presentationModeFriendlyAccountName = function(account) {
        if(account.apikey) {
            return account.name.split('.')[0]; // Get the "AccountName" from "AccountName.1234"
        }

        return "Snaff";
    };

    $scope.presentationModeFriendlyAccountEmail = function(account) {
        return $scope.presentationModeFriendlyAccountName(account).toLowerCase() + "@guildwars2.com";
    }

    $scope.parsePermissions = function(permissions) {
        var usedPermissions = [];

        USED_PERMISSIONS.forEach(function(p) {
            usedPermissions.push({
                name: p,
                granted: (permissions.indexOf(p) > -1)
            });
        });

        return usedPermissions;
    };

    $scope.checkApiKey = function() {
        var apikey = $scope.editAcc.apikey;

        $scope.editAcc._permissions = $scope.parsePermissions([]);

        Gw2Service.getTokenInfo(apikey).then(function(res) {
            var data = res.data;

            $scope.editAcc._permissions = $scope.parsePermissions(data.permissions);
        });
    };

    $scope.encryptData = function(masterPassword) {
        $localStorage.useEncryption = true;

        $localStorage.encryptionTest = AES.encrypt(ENCRYPTION_TEST_STRING, masterPassword);

        // encrypt existing accounts
        $scope.accounts.forEach(function(account) {
            account.password = AES.encrypt(account.password, masterPassword);

            if(account.apikey != undefined) {
                account.apikey = AES.encrypt(account.apikey, masterPassword);
            }
        });

        // update accounts in localStorage
        $localStorage.accounts = $scope.accounts;

        $scope.onMasterPasswordSet(masterPassword);
    };

    $scope.onMasterPasswordSet = function(masterPassword) {
        if($scope.useEncryption()) {
            $sessionStorage.masterPassword = masterPassword;
        }

        // before the master password is set every operation with decrypt will fail
        // so we need to broadcast that it's now ready
        $rootScope.$broadcast("master-password-set");

        $scope.registerUpdateCallback(function() {
            // update known account informations
            $scope.accounts.forEach(function(account) {
                var now = new Date();
                juicy.log("update account: " + account.email);
                $scope.updateAccountInformations(account);
            });
        });
    };

    $scope.apiErrorOccurred = function(account) {
        return account.requestError && account.requestError.occurred;
    };

    $scope.updateAccountInformations = function(account) {
        // HACK: add attribute if some old account doesn't have it
        if(!account.created) {
            account.created = new Date();
        }

        if(account.apikey) {
            var apikey = $scope.decrypt(account.apikey);
            Gw2Service.getAccountInformations(apikey).then(function(res) {
                if(account.requestError && account.requestError.occurred) {
                    // connection seems fine now
                    account.requestError.occurred = false;
                }

                var data = res.data;

                account.account_id = data.id;
                account.name = data.name;
                account.world = data.world;
                account.guilds = data.guilds;

                // The first digit in the world id represents the location 1 = NA, 2 = EU
                account.location = ("" + account.world)[0] == "1" ? "na" : "eu";

                // determine the language of your world
                if(account.location == "na") {
                    account.worldlang = "en";
                } else {
                    // second digit in the world id seems to represent language 0 = EN, 1 = FR, 2 = DE, 3 = SP
                    var langid = ("" + account.world)[1];

                    account.worldlang = langid == 1 ? "fr" : langid == 2 ? "de" : langid == 3 ? "es" : "en";
                }

                Gw2Service.getTokenInfo(apikey).then(function(res) {
                    var data = res.data;

                    account.permissions = data.permissions;

                    $rootScope.$broadcast("account-permissions-changed");

                    // can use wallet? add stuff
                    if($scope.canUseWallet(account)) {

                        var ID_COINS = 1;
                        var ID_LAURELS = 3;

                        Gw2Service.getWallet(apikey).then(function(res) {
                            var data = res.data;

                            // didn't have wallet before, add one
                            if(!account.wallet) {
                                account.wallet = {};
                                account.wallet.coins = {};
                                account.wallet.canShow = false;
                            }

                            // get laurels and coins
                            var currency = data.filter(function(item) {
                                return item.id == ID_COINS || item.id == ID_LAURELS;
                            });

                            var hasLaurels = currency.filter(function(item) {
                                return item.id == ID_LAURELS;
                            }).length > 0;

                            // the api doesn't add currencies with a value of 0, so I need to add it
                            // manually so that the launcher can update it to 0 properly
                            if(!hasLaurels) {
                                currency.push({
                                    id: ID_LAURELS,
                                    value: 0
                                });
                            }

                            currency.forEach(function(item) {
                                if(item.id == ID_COINS) {
                                    var coins = item.value;

                                    account.wallet.coins = convertToGw2Money(coins);
                                } else if(item.id == ID_LAURELS) {
                                    account.wallet.laurels = item.value;
                                }
                            });

                            account.wallet.canShow = true;
                        });
                    }

                    if($scope.canUsePvP(account)) {
                        Gw2Service.getPvPStats(apikey).then(function(res) {
                            var data = res.data;

                            account.pvprank = res.data.pvp_rank;
                        })
                    }

                    // update accounts in localStorage
                    $localStorage.accounts = $scope.accounts;
                });
            }, function(res) {
                juicy.error(res.status + " (" + res.statusText + "): " + JSON.stringify(res.data));

                // This usually occurs when an API key is revoked or wrong
                if(res.status == 400 || res.status == 403) {
                    juicy.warn("Status was: {0} potential invalid apikey on account {1}", res.status, account.email);
                    juicy.warn(res.data);

                    var errorNumber = $scope.fileApiError(res.status, res.data);

                    account.requestError = {
                        occurred: true,
                        number: errorNumber
                    };

                    juicy.warn("Logged new API error with number: " + errorNumber);

                    account.permissions = [];
                    $localStorage.accounts = $scope.accounts;
                }
            });
        } else {
            // update accounts in localStorage
            $localStorage.accounts = $scope.accounts;
        }
    };
});

app.controller("ActionsController", function($scope, $rootScope, $localStorage, Gw2Service) {
    $scope.permissions = [];
    $scope.settings = angular.copy($localStorage.configs);

    $scope.gw2Path = $rootScope.path();

    $scope.submitAddAccountDialog = function() {
        $scope.addAccount(angular.copy($scope.account));
        $scope.account = {};

        $scope.permissions = [];

        $scope.addAccountDialog.close();
    };

    $scope.showAddAccountDialog = function(show) {
        $scope.permissions = $scope.parsePermissions([]);
        $scope.showDialog($scope.addAccountDialog, show);
    };

    $scope.showSettingsDialog = function(show) {
        $scope.settings = angular.copy($localStorage.configs);
        $scope.showDialog($scope.settingsDialog, show);
    };

    $scope.showAboutDialog = function(show) {
        $scope.showDialog($scope.aboutDialog, show);
    };

    $scope.showGithubPage = function() {
        openUrl("https://github.com/kasoki/LoginWars2");
    };

    $scope.showDonatePage = function() {
        var lang = $scope.configs().language;

        var donateUrl = "http://donate.kasoki.de/";

        if(lang == "de" || lang == "fr") {
            openUrl(donateUrl + lang);
            return;
        }

        openUrl(donateUrl);
    };

    $scope.checkApiKey = function() {
        var apikey = $scope.account.apikey;

        Gw2Service.getTokenInfo(apikey).then(function(res) {
            var data = res.data;

            $scope.permissions = $scope.parsePermissions(data.permissions);
        });
    };

    $scope.submitSettingsDialog = function() {
        var oldLanguage = angular.copy($localStorage.configs.language);

        // update settings
        $localStorage.configs = $scope.settings;

        // language changed invalidate the item cache
        if(oldLanguage != $scope.settings.language) {
            juicy.log("invalidating item cache...");
            $rootScope.$broadcast("language-changed");
        }

        $scope.showSettingsDialog(false);
    };

    $scope.resetGw2Path = function() {
        juicy.log("Reset gw2 exe path...");
        ipc.send("gw2-find-path", null);

        // HACK
        setTimeout(function() {
            $scope.gw2Path = $localStorage.gw2Path;
            $scope.$apply();
        }, 500);
    }

    $scope.selectCustomGw2Path = function() {
        juicy.log("Select custom gw2 exe path...");

        ipc.on("gw2-selected-path", function(e, path) {
            console.log("ASDF " + path);
            $scope.gw2Path = path;
            $scope.$apply();
        });

        ipc.send("gw2-select-path");
    }
});

app.controller("EncryptionController", function($scope, $localStorage, $sessionStorage) {
    if($scope.useEncryption() == undefined) {
        // open ask encryption dialog
        $scope.askEncryptionDialog.showModal();
    } else if($scope.useEncryption()) {
        // if master password is still stored in sessionStorage
        if($sessionStorage.masterPassword != undefined) {
            $scope.onMasterPasswordSet($sessionStorage.masterPassword);
        } else {
            // ask for password
            $scope.decryptDialog.showModal();
        }
    } else {
        // no encryption used, be ready
        $scope.onMasterPasswordSet(null);
    }

    $scope.askDialogYes = function() {
        // show encryption enter dialog
        $scope.askEncryptionDialog.close();
        $scope.enterEncryptionDialog.showModal();
    };

    $scope.askDialogNo = function() {
        $localStorage.useEncryption = false;
        $scope.askEncryptionDialog.close();
        $scope.onMasterPasswordSet(null);
    };

    $scope.enterDialogCancel = function() {
        $scope.enterEncryptionDialog.close();
        $scope.askEncryptionDialog.showModal();
    };

    $scope.submitEncryptionDialog = function() {
        if($scope.encryption.password == $scope.encryption.passwordConfirm) {
            $scope.encryptData($scope.encryption.password);
            $scope.enterEncryptionDialog.close();
        } else {
            query("#encrypt-dialog-error").innerHTML = $scope.translate("PASSWORD_DONT_MATCH");
            juicy.log("Passwords don't match");
        }
    };

    $scope.submitDecryptDialog = function() {
        var password = $scope.decryptPassword;

        var encryptionTest = AES.decrypt($localStorage.encryptionTest, password);

        if(encryptionTest == ENCRYPTION_TEST_STRING) {
            // master password is right
            $scope.onMasterPasswordSet(password);
            $scope.decryptDialog.close();
        } else {
            // TODO: password wrong add error message
            query("#decrypt-dialog-error").innerHTML = $scope.translate("MASTER_PASSWORD_WRONG");
            juicy.log("Wrong password " + $localStorage.encryptionTest);
        }
    };
});
