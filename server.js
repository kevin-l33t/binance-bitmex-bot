require('dotenv').config()

var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var sgMail = require('@sendgrid/mail');
var SwaggerClient = require("swagger-client");
var _ = require('lodash');
var BitMEXAPIKeyAuthorization = require('./lib/BitMEXAPIKeyAuthorization');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.use(bodyParser.urlencoded({ extended: false }));

// function sendEmail(message, email){
// 	const msg = {
// 	  to: process.env.NOTIFY_EMAIL,
// 	  from: 'test@example.com',
// 	  subject: 'Sending with SendGrid is Fun',
// 	  text: 'and easy to do anywhere, even with Node.js',
// 	  html: '<strong>and easy to do anywhere, even with Node.js</strong>',
// 	};
// 	sgMail.send(msg);
// }


function buyOrder(symbol){

  // Check positions, if already long or short, do nothing, if opposite, sell at market
  new SwaggerClient({
    // Switch this to `www.bitmex.com` when you're ready to try it out for real.
    // Don't forget the `www`!
    url: 'https://testnet.bitmex.com/api/explorer/swagger.json',
    usePromise: true
  })
  .then(function(client) {
    inspect(client.apis)
    // Comment out if you're not requesting any user data.
    client.clientAuthorizations.add("apiKey", new BitMEXAPIKeyAuthorization(process.env.BITMEX_API_KEY, process.env.BITMEX_API_SECRET));

    // First cancel any unfilled orders
    client.Order.Order_cancelAll()
    .then(function(){
      client.Position.Position_get()
      .then(function(response){
        if (response.obj[0].isOpen) {
          // if there is an active long position, ignore message.
          if (response.obj[0].currentQty > 0) {
            console.log("Long position already opened")
            placeOrder(client, symbol, 'Buy')
            return
          // if there is an active short position, close at market
          } else if (response.obj[0].currentQty < 0) {
            client.Order.Order_closePosition({symbol: symbol})
            .then(function(response){
              console.log('open short order has been closed')
              placeOrder(client, symbol, 'Buy')
            })
            .catch(function(e){
              sendErrorEmail(e);
            })
          }
        } else {
          console.log('nothing open')
          placeOrder(client, symbol, 'Buy')
        }
      })
      .catch(function(e){
        sendErrorEmail(e);
      }) 
    })
    .catch(function(e){
      sendErrorEmail(e);
    })
  })
}

function placeOrder(client, symbol, side){
  client.User.User_getMargin().
  then(function(wallet){
    console.log(wallet.obj)
    var balance = wallet.obj.availableMargin / 100000000;
    client.OrderBook.OrderBook_getL2({symbol: symbol})
    .then(function(orders){
      if (side === "Buy") {
        var price = orders.obj[25].price;
      } else {
        var price = orders.obj[24].price;
      }
      var amount = Math.floor(price * balance);
      if (amount > 0) {
        client.Order.Order_new({symbol: symbol, orderQty: amount, price: price, side: side})
        .then(function(order){
          console.log(order)
        })
        .catch(function(e){
          console.log(e)
        })
      } else {
        console.log('all funds in use')
      }
    })
  })
}

function sellOrder(symbol){
  // Check positions, if already long or short, do nothing, if opposite, sell at market
  new SwaggerClient({
    // Switch this to `www.bitmex.com` when you're ready to try it out for real.
    // Don't forget the `www`!
    url: 'https://testnet.bitmex.com/api/explorer/swagger.json',
    usePromise: true
  })
  .then(function(client) {
    inspect(client.apis)
    // Comment out if you're not requesting any user data.
    client.clientAuthorizations.add("apiKey", new BitMEXAPIKeyAuthorization(process.env.BITMEX_API_KEY, process.env.BITMEX_API_SECRET));

    // First cancel any unfilled orders
    client.Order.Order_cancelAll()
    .then(function(){
      client.Position.Position_get()
      .then(function(response){
          console.log(response)
        if (response.obj[0].isOpen) {
          // if there is an active long position, ignore message.
          if (response.obj[0].currentQty < 0) {
            console.log("Long position already opened")
            placeOrder(client, symbol, 'Sell')
          // if there is an active short position, close at market
          } else if (response.obj[0].currentQty > 0) {
            client.Order.Order_closePosition({symbol: symbol})
            .then(function(response){
              console.log('open short order has been closed')
              placeOrder(client, symbol, 'Sell')
            })
            .catch(function(e){
              sendErrorEmail(e);
            })
          }
        } else {
          console.log('nothing open')
          placeOrder(client, symbol, 'Sell')
        }
      })
      .catch(function(e){
        sendErrorEmail(e);
      }) 
    })
    .catch(function(e){
      sendErrorEmail(e);
    })
  })
}

app.get('/', function (req, res) {
	res.send('Hello World!');
});

// where text messages are sent
app.post('/trade_notification', function(req, res) {
	console.log(req.body.Body)
});

app.listen(3000, function () {
	console.log('Example app listening on port 3000!');
});

function inspect(client) {
  console.log("Inspecting BitMEX API...");
  Object.keys(client).forEach(function(model) {
    if (!client[model].operations) return;
    console.log("Available methods for %s: %s", model, Object.keys(client[model].operations).join(', '));
  });
  console.log("------------------------\n");
}

buyOrder('XBTUSD')