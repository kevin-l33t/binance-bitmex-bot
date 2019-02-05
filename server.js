require('dotenv').config()

var express = require('express');
var app = express();
var bodyParser = require('body-parser');

var bitmex = require('./lib/bitmex');
var binance = require('./lib/binance');

var binanceAPI = require('node-binance-api')().options({
  APIKEY: process.env.BINANCE_API_KEY,
  APISECRET: process.env.BINANCE_API_SECRET
});

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

var bitmexBuyOrder = bitmex.buyOrder;
var bitmexSellOrder = bitmex.sellOrder;

var binanceOrder = binance.placeOrder;

app.get('/', function (req, res) {
  console.log('working')
	res.send('Hello World!');
});


var bitmexPairs = ['XBTUSD', 'XBTJPY', 'ADAH19', 'BCHH19', 'EOSH19', 'ETHUSD', 'LTCH19', 'TRXH19', 'XRPH19', 'XBTKRW'];
var binancePairs

function getTickers() {
  binanceAPI.prices((error, ticker) => {
    if (error) {
      console.log(error);
      return
    }
    if (ticker) {
      binancePairs = Object.keys(ticker)
    }
  });
}

getTickers()

// where text messages are sent
app.post('/trade_notification', function(req, res) {
  var tradeNotification = req.body.Body.toLowerCase();
  if (tradeNotification.includes('bitmex')) {
    if (tradeNotification.includes('buy')) {
      for (var i=0; i<bitmexPairs.length; i++) {
        if (tradeNotification.includes(bitmexPairs[i].toLowerCase())) {
          bitmexBuyOrder(bitmexPairs[i], process.env.RETRY)
        }
      }
    } else if (tradeNotification.includes('sell')) {
      for (var i=0; i<bitmexPairs.length; i++) {
        if (tradeNotification.includes(bitmexPairs[i].toLowerCase())) {
          bitmexSellOrder(bitmexPairs[i], process.env.RETRY)
        }
      }
    }
  } else if (tradeNotification.includes('binance')) {
    if (tradeNotification.includes('buy')) {
      for (var i=0; i<binancePairs.length; i++) {
        if (tradeNotification.includes(binancePairs[i].toLowerCase())) {
          binanceOrder(binancePairs[i], 'BUY', process.env.BINANCE_ORDER_TYPE, process.env.RETRY)
        }
      }
    } else if (tradeNotification.includes('sell')) {
      for (var i=0; i<binancePairs.length; i++) {
        if (tradeNotification.includes(binancePairs[i].toLowerCase())) {
          binanceOrder(binancePairs[i], 'SELL', process.env.BINANCE_ORDER_TYPE, process.env.RETRY)
        }
      }
    }
  }
  res.sendStatus(200);
});

var server_port = process.env.PORT || 3000;

app.listen(server_port, function () {
	console.log('BitMEX leverage bot is listening on port: ' + server_port);
});

// setTimeout(function(){
//   bitmexSellOrder('XBTUSD', process.env.RETRY);
// },3000)
