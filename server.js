require('dotenv').config()

var express = require('express');
var app = express();
var bodyParser = require('body-parser');

var sgMail = require('@sendgrid/mail');
var SwaggerClient = require("swagger-client");
var BitMEXClient = require('bitmex-realtime-api');
var BitMEXAPIKeyAuthorization = require('./lib/BitMEXAPIKeyAuthorization');

var bitmexSocket = new BitMEXClient({testnet: true, apiKeyID: process.env.BITMEX_API_KEY, apiKeySecret: process.env.BITMEX_API_SECRET});

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());


function sendEmail(message, subject){
	const msg = {
	  to: process.env.NOTIFY_EMAIL,
	  from: 'BitMEX@bot.com',
	  subject: subject,
	  text: message
	};
	sgMail.send(msg);
}

function sendLimitOrderEmail(order) {
  var orderMsg = "";
  var subjectWord = order.ordStatus === "Filled" ? "filled" : "placed";
  var subject = order.ordType + " " + order.side + " order " + subjectWord + " for " + order.symbol 
  orderMsg += subject + ".\n\n";
  orderMsg += "Order Quantity: " + order.orderQty + "\n\n";
  orderMsg += "Order Price: " + order.price + "\n\n";
  orderMsg += "Order Status: " + order.ordStatus + ".";
  sendEmail(orderMsg, subject);
}

function sendMarketOrderEmail(order) {
  var orderMsg = "";
  var subject = order.ordType + " " + order.side + " order placed for " + order.symbol;
  orderMsg += subject + ".\n\n";
  orderMsg += "Order Quantity: " + order.orderQty + "\n\n";
  orderMsg += "Order Price: " + order.price + "\n\n";
  orderMsg += "Order Status: " + order.ordStatus + ".";
  sendEmail(orderMsg, subject);
}

function sendErrorEmail(e) {
  var subject = "BitMEX Bot: An Error has Occurred."
  sendEmail(e, subject);
}

var pendingOrders = [];
var socketsOpen = [];

function openBitmexSocket(symbol) {
  if (socketsOpen.indexOf(symbol) === -1) {
    bitmexSocket.addStream(symbol, 'order', function(data, symbol, tableName) {
      socketsOpen.push(symbol);
      for (var i=0; i<data.length; i++) {
        for (var x=0; x<pendingOrders.length; x++) {
          if (data[i].orderID === pendingOrders[x]) {
            if (data[i].ordStatus === "Filled") {
              pendingOrders.splice(x, 1);
              sendLimitOrderEmail(data[i]);
            }
          }
        }
      }
    })
  }
}

function retryLoop(retries, timeout, orderID, symbol, side, price) {
  if (retries === 0) {
    console.log("Out of retries, stopping.")
  }
  var milliseconds = timeout * 1000;
  setTimeout(function(){
    if (pendingOrders.indexOf(orderID) !== -1) {
      api.OrderBook.OrderBook_getL2({symbol: symbol})
      .then(function(orders) {
        if (side === "Buy") {
          if (orders.obj[25].price !== price) {
            buyOrder(symbol, retries)
          } else {
            console.log('Price hasn\'t changed. Retries left: ' + retries);
            retryLoop(retries - 1, timeout, orderID, symbol, side, price);
          }
        } else {
          if (orders.obj[24].price !== price) {
            sellOrder(symbol, retries)
          } else {
            console.log('Price hasn\'t changed. Retries left: ' + retries);
            retryLoop(retries - 1, timeout, orderID, symbol, side, price);
          }
        }
      })
      .catch(function(e){
        sendErrorEmail(e);
        console.log(e);
      })
    }
  }, milliseconds)
}

var api;

new SwaggerClient({
  // Switch this to `www.bitmex.com` when you're ready to try it out for real.
  // Don't forget the `www`!
  url: 'https://bitmex.com/api/explorer/swagger.json',
  usePromise: true
})
.then(function(client) {
  inspect(client.apis)
  // Comment out if you're not requesting any user data.
  client.clientAuthorizations.add("apiKey", new BitMEXAPIKeyAuthorization(process.env.BITMEX_API_KEY, process.env.BITMEX_API_SECRET));
  api = client;
})
.catch(function(e){
  console.log(e);
  sendErrorEmail(e);
})


function buyOrder(symbol, retry){
  api.Order.Order_cancelAll()
  .then(function(){
    pendingOrders = [];
    api.Position.Position_get()
    .then(function(response){
      var activeWallet = response.obj.filter(function(wallet) {
        return wallet.symbol === symbol
      })[0]
      if (!activeWallet) {
        placeOrder(api, symbol, 'Buy', retry)
        return
      }
      if (activeWallet.isOpen) {
        // if there is an active long position, ignore message.
        if (activeWallet.currentQty > 0) {
          console.log("Long position already opened.")
          api.User.User_getMargin()
          .then(function(balance){
            console.log("Available balance: " + balance.obj.availableMargin)
            if (balance.obj.availableMargin > 30000) {
              console.log("Placing another long order for the remaining balance.")
              placeOrder(api, symbol, 'Buy', retry)
            } else {
              console.log("Full balance is invested in an open long position, nothing is being changed.")
            }
          })
        // if there is an active short order, close at market
        } else if (activeWallet.currentQty < 0) {
          api.Order.Order_closePosition({symbol: symbol})
          .then(function(response){
            console.log('Open short order has been closed at market rate.')
            placeOrder(api, symbol, 'Buy', retry)
          })
          .catch(function(e){
            console.log(e);
            sendErrorEmail(e);
          })
        }
      } else {
        console.log('No orders currently open. Placing buy/long order...')
        placeOrder(api, symbol, 'Buy', retry)
      }
    })
    .catch(function(e){
      sendErrorEmail(e);
      console.log(e);
    }) 
  })
  .catch(function(e){
    sendErrorEmail(e);
    console.log(e);
  })
}

function sellOrder(symbol, retry){
  // First cancel any unfilled orders
  api.Order.Order_cancelAll()
  .then(function(){
    pendingOrders = [];
    api.Position.Position_get()
    .then(function(response){
      var activeWallet = response.obj.filter(function(wallet) {
        return wallet.symbol === symbol
      })[0]
      if (!activeWallet) {
        placeOrder(api, symbol, 'Sell', retry)
        return
      }
      if (activeWallet.isOpen) {
        // if there is an active short position, ignore message.
        if (activeWallet.currentQty < 0) {
          console.log("Short position already opened.")
          api.User.User_getMargin()
          .then(function(balance){
            if (balance.obj.availableMargin > 30000) {
              console.log("Placing another short order for the remaining balance.")
              placeOrder(api, symbol, 'Sell', retry)
            } else {
              console.log("Full balance is invested in an open short position, nothing is being changed.")
            }
          })
        // if there is an active long order, close at market
        } else if (activeWallet.currentQty > 0) {
          api.Order.Order_closePosition({symbol: symbol})
          .then(function(response){
            console.log('Open long order has been closed at market rate.')
            placeOrder(api, symbol, 'Sell', retry)
          })
          .catch(function(e){
            sendErrorEmail(e);
            console.log(e);
          })
        }
      } else {
        console.log('No orders currently open. Placing buy/long order...');
        placeOrder(api, symbol, 'Sell', retry);
      }
    })
    .catch(function(e){
      sendErrorEmail(e);
      console.log(e);
    }) 
  })
  .catch(function(e){
    sendErrorEmail(e);
    console.log(e);
  })
}

function placeOrder(client, symbol, side, retry){
  //first set leverage, then purchase amount * leverage
  client.Position.Position_updateLeverage({symbol: symbol, leverage: process.env.LEVERAGE})
  .then(function(leverage){
    var percent = leverage.obj.initMarginReq + leverage.obj.maintMarginReq + leverage.obj.commission;
    client.User.User_getMargin()
    .then(function(wallet){
      var balance = wallet.obj.availableMargin / 100000000;
      client.OrderBook.OrderBook_getL2({symbol: symbol})
      .then(function(orders){
        if (side === "Buy") {
          var price = orders.obj[25].price;
        } else {
          var price = orders.obj[24].price;
          console.log(price)
        }
        if (price < 1) {
          var amount = Math.floor((balance / price) * (process.env.LEVERAGE * ((100 - process.env.LEVERAGE * .15)/100)));  
        } else {
          var amount = Math.floor((price * balance) * (process.env.LEVERAGE * ((100 - process.env.LEVERAGE * .15)/100)));
        }
        console.log(price, balance, amount)
        if (process.env.ORDER_TYPE === "limit") {
          if (amount > 0) {
            client.Order.Order_new({symbol: symbol, orderQty: amount, price: price, side: side})
            .then(function(order){
              console.log("Limit order placed for " + response.obj.orderQty + " contracts. Order status: " + response.obj.ordStatus)
              sendLimitOrderEmail(order.obj)
              setTimeout(function(){
                pendingOrders.push(order.obj.orderID);
                openBitmexSocket(symbol);
                retryLoop(retry - 1, process.env.TIMEOUT, order.obj.orderID, symbol, side, order.obj.price);                
              },1000)
            })
            .catch(function(e){
              if (e.obj.error.message.indexOf("insufficient Available Balance")) {
                var num = parseInt(e.obj.error.message.split(", ")[1].split(" ")[0]);
                var price = orders.obj[24].price;
                var balance = (wallet.obj.availableMargin - wallet.obj.grossExecCost);
                var cost = num / amount;
                var newAmount = Math.floor((wallet.obj.availableMargin / cost) * .98);
                client.Order.Order_new({symbol: symbol, orderQty: newAmount, price: price, side: side})
                .then(function(order){
                  console.log("Limit order placed for " + response.obj.orderQty + " contracts. Order status: " + response.obj.ordStatus)
                  sendLimitOrderEmail(order.obj)
                  setTimeout(function(){
                    pendingOrders.push(order.obj.orderID);
                    openBitmexSocket(symbol);
                    retryLoop(retry - 1, process.env.TIMEOUT, order.obj.orderID, symbol, side, order.obj.price);
                  },1000)
                })
                .catch(function(e){
                  console.log("There was an issue calculating your max order. Try reducing the leverage.")
                  sendErrorEmail(e)
                })
              }
            })
          } else { 
            console.log('All funds in use.')
          }
        } else {
          client.Order.Order_new({symbol: symbol, ordType: 'Market', orderQty: amount, side: side})
          .then(function(response){
            console.log("Market order placed for " + response.obj.orderQty + " contracts. Order status: " + response.obj.ordStatus)
            sendMarketOrderEmail(response.obj)
          })
          .catch(function(e) {
            console.log(e)
            sendErrorEmail(e)
          })
        }
      })
      .catch(
        function(e){
          console.log(e);
          sendErrorEmail(e);
      })
    })
    .catch(function(e){
      console.log(e);
      sendErrorEmail(e);
    })
  })
  .catch(function(e){
    console.log(e);
    console.log("You tried to change the leverage on an already open order and don't have sufficient funds to do so.");
    sendEmail("You tried to change the leverage while an order was already open and don't have sufficient funds to do so.", "BitMEX Bot: Not Enough Funds to Change Leverage. \n", e);
  })
  
}

app.get('/', function (req, res) {
  console.log('working')
	res.send('Hello World!');
});


var bitmexPairs = ['XBTUSD', 'XBTJPY', 'ADAH19', 'BCHH19', 'EOSH19', 'ETHUSD', 'LTCH19', 'TRXH19', 'XRPH19', 'XBTKRW'];

// where text messages are sent
app.post('/trade_notification', function(req, res) {
  var tradeNotification = req.body.Body.toLowerCase();
  if (tradeNotification.includes('bitmex')) {
    if (tradeNotification.includes('buy')) {
      for (var i=0; i<bitmexPairs.length; i++) {
        if (tradeNotification.includes(bitmexPairs[i].toLowerCase())) {
          buyOrder(bitmexPairs[i], process.env.RETRY)
        }
      }
    } else if (tradeNotification.includes('sell')) {
      for (var i=0; i<bitmexPairs.length; i++) {
        if (tradeNotification.includes(bitmexPairs[i].toLowerCase())) {
          sellOrder(bitmexPairs[i], process.env.RETRY)
        }
      }
    }
  }

  res.sendStatus(200);
});

// where text messages are sent
app.post('/woowoo', function(req, res) {
  var tradeNotification = req.body.Body.toLowerCase();

  console.log(tradeNotification)

  res.sendStatus(200);
});

var server_port = process.env.PORT || 3000;

app.listen(server_port, server_ip_address, function () {
	console.log('BitMEX leverage bot is listening on port: ' + server_port);
});

function inspect(client) {
  console.log("Inspecting BitMEX API...");
  Object.keys(client).forEach(function(model) {
    if (!client[model].operations) return;
    console.log("Available methods for %s: %s", model, Object.keys(client[model].operations).join(', '));
  });
  console.log("------------------------\n");
}