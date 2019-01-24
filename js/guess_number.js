// "use strict";

/* 
    This file is intended for blockchain demo in Fintech class.
    The file works as follow:
        1. Get Web3.js provider from MetaMask.
        2. Read your account, balance from MetaMask.
        3. Query contract status and update the guessing range.
        4. Keep updating your balance and contract status in order to detect if anyone has guessed the right number.
    
    All of data we read are stored to Vue object for instant rendering.
*/

/* 
    Helper functions:
        common method used by many functions.
*/

// Just sleep for a period of milliseconds.
// Any function that uses sleep() should be declared with a prefix "async".
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/*
    Blockchain-related: Web3.js
*/

// When the page is loaded, have all your Web3.js settings set.
window.addEventListener('load', function () {
    updateWeb3Settings();
});

// Trigger animation when you click on "Get Start" button.
$("#show-guess").click(() => {
    $("#get-start").animate({
        opacity: 0,
        left: "+=50",
        height: "toggle"
    }, 500, () => {
        $("#guess").animate({
            opacity: 1,
            left: "+=50",
            height: "toggle"
        }, 500, () => {});
    });
});

// Update my balance and status of contract every second.
setInterval(function() {
    if (app.contract.registered) {
        getMyBalance();
        queryContract();
    }
}, 1000);

// Initialize Web3.js settings
async function updateWeb3Settings() {
    // If web3 is injected to this page by MetaMask.
    if (typeof web3 !== 'undefined') {
        // 1. Get Web3 provider from MetaMask and set my account.
        while (!app.web3.account) {
            setWeb3Account();
            await sleep(500);
        }
        // 2. You must have a default account set for contract transactions.
        web3.eth.defaultAccount = app.web3.account;
        // 3. Read network from MetaMask.
        while (app.web3.network != "ropsten") {
            updateNetwork();
            await sleep(500);
        }
        // 4. Get the value of my balance.
        getMyBalance();
    } else {
        // Manually specify the provider API
        console.log('No Web3 Detected...');
        var api_url = "https://mainnet.infura.io/<APIKEY>";
        window.web3 = new Web3(new Web3.providers.HttpProvider(api_url));
    }
}

// Read your account from MetaMask
function setWeb3Account() {
    // Read Web3.js provider from MetaMask.
    window.web3 = new Web3(web3.currentProvider);
    // Read API info from MetaMask
    app.web3.provider = web3.currentProvider.constructor.name;
    app.web3.api_ver = web3.version.api;
    // Store your account (the first account in MetaMask) to Vue object
    app.web3.acc_id = 0
    app.web3.account = web3.eth.accounts[app.web3.acc_id];
    if (app.web3.account) {
        console.log('Account set! You are ' + app.web3.account + '.');
    } else {
        console.log('Account detection failed!');
    }
}

// Read your network from MetaMask
function updateNetwork() {
    // Check if you're in Ropsten
    web3.version.getNetwork(function(err, netId) {
        if (!err) {
            if (netId == 3) {
                app.web3.network = "ropsten";
                console.log("Network set! You're in Ropsten Network.");
            }
        }
    });
}

// Update your balance by the account from MetaMask.
function getMyBalance() {
    web3.eth.getBalance(app.web3.account, function (error, wei) {
        if (!error) {
            if (app.web3.balance != parseFloat(web3.fromWei(wei, 'ether'))) {
                app.web3.balance = parseFloat(web3.fromWei(wei, 'ether'));
                console.log("Balance updated! You have " + app.web3.balance + ".");
            }
        }
    });
}


// Get a contract object.
// By contract design, we have to register in it first.
// So we check if you've registered first.
function getContract() {
    // Get the contract object by its abi and address.
    var contract = web3.eth.contract(app.contract.abi).at(app.contract.address);
    // If you're not registered in the contract.
    if (!app.contract.registered) {
        var transactionObject = {
            from: app.web3.account,
            gasPrice: 1500 * Math.pow(10, 9),
            gas: 100000
        };
        // Call "register" method in the contract.
        // We also provide a transactionObject to specify how much gas it costs.
        contract.register(transactionObject, async function(err, result) {
            if (!err && result) {
                app.contract.register_running = true;
                // If you reach here, it means that the method call is succeeded, but you have to wait for it till it is done mining!
                while (app.contract.register_running) {
                    // Check the receipt of the method call
                    web3.eth.getTransactionReceipt(result, (e, r) => {
                        if (!e && r && "status" in r) { // Read the "status" code it returns.
                            app.contract.registered = true;
                            app.contract.register_running = false;
                            // getMyBalance();
                            console.log("You've registered in the contract!\nTransaction ID: " + result);
                            getWinnerEvent(); // Register event
                        }
                    });
                    await sleep(4000);
                }
            }
        });
    }
    return contract;
}

// The contract itself emits an event when someone (winner) guesses a correct number.
// With Web3.js, we can watch the event in our client.
function getWinnerEvent() {
    // Get the contract object
    contract = getContract();
    // Get the event object (the event is named as "Winner")
    event = contract.Winner();
    // Watch
    event.watch(function(error, result) {
        if (!error) {
            // Once the event is emitted, we save the correct guesser and number.
            console.log(result);
            app.guess_number.correct_guesser = result.args._winner;
            app.guess_number.correct_number = parseInt(result.args._answer);
        }
    });
}

// Everyone has his/her own upper bound and lower bound in the contract.
// And in the contract we define a "query" method to recieve the upper and lower bound of the current account.
function queryContract() {
    contract = getContract()
    contract.query(async function(err, result) {
        if (!err) {
            // Check if you've guessed once
            if (app.guess_number.lower_bound != null && app.guess_number.upper_bound != null && app.guess_number.upper_bound != 0) {
                // If your upper bound gets greater, or your lower bound gets smaller, it means that someone (or you) has guessed the correct number, and resetted the bound.
                if (app.guess_number.lower_bound > parseInt(result[0]) || app.guess_number.upper_bound < parseInt(result[1])) {
                    $("#guess_right").modal('open');
                    app.guess_number.already_guessing = false;
                    app.guess_number.guess = null;
                    shake();
                    console.log("Contract updated! You can now guess from " + result[0] + " to " + result[1] + ".");
                // Or if your upper bound or lower bound changes, it means that you've guessed the wrong number.
                } else if (app.guess_number.lower_bound != parseInt(result[0]) || app.guess_number.upper_bound != parseInt(result[1])) {
                    $("#guess_wrong").modal('open');
                    app.guess_number.already_guessing = false;
                    app.guess_number.guess = null;
                    shake();
                    console.log("Contract updated! You can now guess from " + result[0] + " to " + result[1] + ".");
                }
            }
            app.guess_number.lower_bound = parseInt(result[0]);
            app.guess_number.upper_bound = parseInt(result[1]);
        }
    });
}

// Guess a number
function guessContract() {
    app.guess_number.guessed = true;
    var transactionObject;
    if (app.guess_number.more_gas) {
        transactionObject = {
            from: app.web3.account,
            gasPrice: 1500 * Math.pow(10, 9),
            gas: 100000,
            value: parseInt(app.guess_number.guess) * Math.pow(10, 15)
        };
    } else {
        transactionObject = {
            from: app.web3.account,
            value: parseInt(app.guess_number.guess) * Math.pow(10, 15)
        };
    }
    contract = getContract()
    contract.guess(transactionObject, async function(err, result) {
        if (!err && result) {
            app.guess_number.already_guessing = true;
            start_guessing = true;
            shake();
            while (start_guessing) {
                web3.eth.getTransactionReceipt(result, function(e, r) {
                    if (!e && r && "status" in r) {
                        // await sleep(5000);
                        // getMyBalance();
                        // queryContract();
                        console.log("Guess done!\nTransaction ID: " + result);
                        start_guessing = false;
                    }
                });
                await sleep(5000);
            }
        }
    });
}


/*
    UI-related:
        - DOM operations
        - Button clicks
        - Animations...
*/

// Modal from Materialize should be initialized first.
$(document).ready(function(){
    $('.modal').modal();
});

// Submit the number you guessed
function submitInput() {
    // Your number should be between the upper bound and the lower bound.
    if (parseInt(app.guess_number.guess) >= app.guess_number.lower_bound && parseInt(app.guess_number.guess) < app.guess_number.upper_bound) {
        guessContract();
    } else {
        $("#modal1").modal('open');
    }
}

// Submit your number when you press Enter in the text field.
function onEnter(element) {
    if (element.key === 'Enter') {
        guessContract();
    }
}

// Shake the submarine
function shake() {
    $(".sea").toggleClass("shake shake-slow shake-constant");
}

// The main Vue object for storing every data we get from MetaMask.
var app = new Vue({
    el: "#guess",
    data: {
        web3: {
            provider: null, 
            api_ver: null,
            account: null,
            acc_id: null,
            balance: null,
            network: null
        },
        students: [],
        register_contract: {
            abi: [{
                "constant": false,
                "inputs": [
                    {
                        "name": "_id",
                        "type": "string"
                    }
                ],
                "name": "sendmySID",
                "outputs": [
                    {
                        "name": "res",
                        "type": "bool"
                    }
                ],
                "payable": false,
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "constant": true,
                "inputs": [
                    {
                        "name": "_id",
                        "type": "string"
                    }
                ],
                "name": "querymySID",
                "outputs": [
                    {
                        "name": "_yourID",
                        "type": "address"
                    }
                ],
                "payable": false,
                "stateMutability": "view",
                "type": "function"
            }],
            address: "0xba0a0d62eebb40969f975e9573be7798ad7bb5c0",
        },
        contract: {
            abi: [{
                    "constant": false,
                    "inputs": [],
                    "name": "guess",
                    "outputs": [],
                    "payable": true,
                    "stateMutability": "payable",
                    "type": "function"
                }, {
                    "constant": false,
                    "inputs": [],
                    "name": "register",
                    "outputs": [],
                    "payable": false,
                    "stateMutability": "nonpayable",
                    "type": "function"
                }, {
                    "inputs": [],
                    "payable": false,
                    "stateMutability": "nonpayable",
                    "type": "constructor"
                }, {
                    "anonymous": false,
                    "inputs": [
                        {
                            "indexed": true,
                            "name": "_winner",
                            "type": "address"
                        },
                        {
                            "indexed": false,
                            "name": "_answer",
                            "type": "uint256"
                        }
                    ],
                    "name": "Winner",
                    "type": "event"
                }, {
                    "constant": true,
                    "inputs": [],
                    "name": "query",
                    "outputs": [
                        {
                            "name": "_left",
                            "type": "uint256"
                        },
                        {
                            "name": "_Right",
                            "type": "uint256"
                        }
                    ],
                    "payable": false,
                    "stateMutability": "view",
                    "type": "function"
                }
            ], /* abi generated by the compiler */
            address: "0xbb84615d927799939fc212d6203b747de8842be5", /* our contract address on Ethereum after deploying */
            registered: false,
            register_running: false
        },
        guess_number: {
            lower_bound: null,
            upper_bound: null,
            guess: null,
            already_guessing: false,
            correct_number: null,
            correct_guesser: null,
            more_gas: false
        }
    },
    methods: {
        getStudentName() {
            for (var i=0; i<this.students.length; i++) {
                if (this.students[i].wallet_addr == this.guess_number.correct_guesser) {
                    return this.students[i].name;
                }
            }
            return this.guess_number.correct_guesser;
        }
    }
});

// Copy from admin.js
setInterval(function() {
    queryRegisterContract();
}, 10000);
async function queryRegisterContract() {
    for (var i=0; i<app.students.length; i++) {
        querySid(i);
        await sleep(100);
    }
}
function querySid(i) {
    var contract = web3.eth.contract(app.register_contract.abi).at(app.register_contract.address);
    contract.querymySID(app.students[i].sid, function(err, result) {
        // console.log(i, err, result);
        if (!err) {
            app.students[i].wallet_addr = result;
        }
    });
}
queryRegisterContract()
