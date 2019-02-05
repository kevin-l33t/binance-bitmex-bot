var SwaggerClient = require("swagger-client");
var BitMEXClient = require('bitmex-realtime-api');
var BitMEXAPIKeyAuthorization = require('./BitMEXAPIKeyAuthorization');
var email = require('./email');

var bitmexSocket = new BitMEXClient({testnet: false, apiKeyID: process.env.BITMEX_API_KEY, apiKeySecret: process.env.BITMEX_API_SECRET});

var pendingOrders = [];
var socketsOpen = [];

var sendEmail = email.sendEmail;
var sendLimitOrderEmail = email.sendLimitOrderEmail;
var sendMarketOrderEmail = email.sendMarketOrderEmail;
var sendErrorEmail = email.sendErrorEmail;

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
  url: 'https://www.bitmex.com/api/explorer/swagger.json',
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
          .catch(function(e){
            console.log(e);
            sendErrorEmail(e);
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
    console.log(e);
    sendErrorEmail(e);
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
          .catch(function(e){
            console.log(e);
            sendErrorEmail(e);
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
        console.log('No orders currently open. Placing sell/short order...');
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
  // first set leverage, then purchase amount * leverage

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
        }

        var contractCost;
        if (symbol === 'ETHUSD') {
          var contractCost = price * .000001;
        } else if (symbol === 'XBTUSD') {
          var contractCost = 1 / price;
        } else {
          var contractCost = price;
        }

        var maxAmount = Math.floor((balance / contractCost) * process.env.LEVERAGE);
        if (process.env.LEVERAGE === 100) {
          var feePercent = .00135
        } else {
          var feePercent = .00155
        }

        var fee = Math.ceil(maxAmount * (process.env.LEVERAGE * feePercent));
        var totalAmount = maxAmount - fee;

        if (process.env.BITMEX_ORDER_TYPE === "limit") {
          if (totalAmount > 0) {
            client.Order.Order_new({symbol: symbol, orderQty: totalAmount, price: price, side: side})
            .then(function(order){
              console.log(order)
              console.log("Limit order placed for " + order.obj.orderQty + " contracts. Order status: " + order.obj.ordStatus)
              sendLimitOrderEmail(order.obj)
              setTimeout(function(){
                pendingOrders.push(order.obj.orderID);
                openBitmexSocket(symbol);
                retryLoop(retry - 1, process.env.TIMEOUT, order.obj.orderID, symbol, side, order.obj.price);                
              },1000)
            })
            .catch(function(e){
              console.log(e)
              if (e.obj.error.message.indexOf("insufficient Available Balance")) {
                var newTotalAmount = totalAmount * .98;
                client.Order.Order_new({symbol: symbol, orderQty: newTotalAmount, price: price, side: side})
                .then(function(order){
                  console.log("Limit order placed for " + order.obj.orderQty + " contracts. Order status: " + order.obj.ordStatus)
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
              } else {
                console.log(e)
                sendErrorEmail(e)
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
    if (e.obj.error.message.indexOf("system is currently overloaded")) {
      setTimeout(function(){
        placeOrder(client, symbol, side, retry)
      }, 15000)
      sendEmail("System currently overloaded, trade did not execute. Trying again in 15 seconds.", "BitMEX Bot: System Overload \n")
    } else {
      console.log(e);
      console.log("You tried to change the leverage on an already open order and don't have sufficient funds to do so.");
      sendEmail("You tried to change the leverage while an order was already open and don't have sufficient funds to do so.", "BitMEX Bot: Not Enough Funds to Change Leverage. \n");     
    }
  }) 
}

function inspect(client) {
  console.log("Inspecting BitMEX API...");
  Object.keys(client).forEach(function(model) {
    if (!client[model].operations) return;
    console.log("Available methods for %s: %s", model, Object.keys(client[model].operations).join(', '));
  });
  console.log("------------------------\n");
}

module.exports = {
  buyOrder: buyOrder,
  sellOrder: sellOrder
}