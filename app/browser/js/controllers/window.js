app.controller("WindowController", function($scope, $rootScope, $localStorage, FeedService, Gw2Service) {
    $scope.loadingDialog = query("#game-starting-dialog");
    $scope.editAccountDialog = query("#edit-account-dialog");
    $scope.addAccountDialog = query("#add-account-dialog");
    $scope.askEncryptionDialog = query("#ask-encryption-dialog");
    $scope.enterEncryptionDialog = query("#enter-encryption-dialog");
    $scope.decryptDialog = query("#decrypt-dialog");
    $scope.settingsDialog = query("#settings-dialog");
    $scope.aboutDialog = query("#about-dialog");

    $scope.accounts = [];

    $scope.gameRunning = false;
    $scope.showContentOverlay = true;

    if($localStorage.accounts && $localStorage.accounts.length > 0) {
        $scope.accounts = $localStorage.accounts;
    }

    $rootScope.$on("master-password-set", function() {
        $scope.checkForNewBuild();

        $scope.showContentOverlay = false;

        $scope.registerUpdateCallback(function() {
            if(!$scope.gameRunning) {
                $scope.checkForNewBuild();
            }
        });
    });

    $scope.closeWindow = function() {
        window.close();
    };

    $scope.showDialog = function(dialog, status) {
        if(status) {
            dialog.showModal();
        } else {
            dialog.close();
        }
    }

    $scope.updateGameClient = function() {
        $scope.loadingDialog.showModal();

        var params = ["-image"];

        if($scope.os().osx) {
            var ciderParams = ["-use-dos-cwd", "\"C:\\Gw2\"", "--", "\"C:\\GW2\\GW2.exe\""];

            params = ciderParams.concat(params);
        }

        var game = spawn($rootScope.executable(), params);

        game.on("exit", function(code, signal) {
            $scope.loadingDialog.close();
        });
    };

    $scope.startClassicLauncher = function() {
        $scope.loadingDialog.showModal();

        var game = spawn($rootScope.executable());

        game.on("exit", function(code, signal) {
            $scope.loadingDialog.close();
        });
    }

    $scope.checkForNewBuild = function() {
        // check last known build number with the current one from the server, if they don't match
        // start update
        Gw2Service.getBuildNumber().then(function(res) {
            var lastBuildNumber = $localStorage.buildNumber;
            $localStorage.buildNumber = res.data.id;

            if(lastBuildNumber != undefined) {
                if(lastBuildNumber != res.data.id) {
                    juicy.log("Current build: " + lastBuildNumber + ", but server claims to have a new one ready: " +
                        res.data.id + "... trying to update...");

                    if($scope.configs().autoUpdates) {
                        $scope.updateGameClient();
                    }
                }
            }
        });
    };

    $scope.login = function(email, password, parametersString) {
        if(!parametersString) {
            parametersString = "";
        }

        var parameters = parametersString.split(" ");

        var launchParams = [
            "-email", "\"" + email + "\"",
            "-password", "\"" + $scope.decrypt(password) + "\"",
            "-nopatchui"
        ];

        if($scope.os().osx) {
            var ciderParams = ["-use-dos-cwd", "\"C:\\Gw2\"", "--", "\"C:\\GW2\\GW2.exe\""];

            launchParams = ciderParams.concat(launchParams);
        }

        launchParams = launchParams.concat(parameters);

        var launch = "\"" + $rootScope.executable() + "\" " + launchParams.join(" ");

        $scope.gameRunning = true;
        $scope.loadingDialog.showModal();

        // close dialog again after 15s
        setTimeout(function() {
            $scope.loadingDialog.close();
        }, 15 * 1000);

        var game = exec(launch);

        game.stdout.on("data", function(data) {
            juicy.log(data.toString());
        });

        game.stderr.on("data", function(data) {
            juicy.error(data.toString());
        });

        game.on("exit", function(code, signal) {
            $scope.gameRunning = false;
            $scope.checkForNewBuild();
        });
    };

    $scope.pad = function(number) {
        if(number < 10) {
            return "0" + number;
        }

        return "" + number;
    };
});
