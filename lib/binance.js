var binance = require('node-binance-api')().options({
  APIKEY: process.env.BINANCE_API_KEY,
  APISECRET: process.env.BINANCE_API_SECRET,
  useServerTime: true // If you get timestamp errors, synchronize to server time at startup
});
var email = require('./email');


var sendEmail = email.sendEmail;
var sendLimitOrderEmail = email.sendLimitOrderEmail;
var sendMarketOrderEmail = email.sendMarketOrderEmail;
var sendErrorEmail = email.sendErrorEmail;

var baseTickers = ['BNB', 'BTC', 'ETH', 'XRP', 'PAX', 'USDT', 'TUSD', 'USDC'];

function splitTicker(pair) {
  var threeLetters = pair.slice(pair.length - 3)
  var fourLetters = pair.slice(pair.length - 4)
  for (var i=0; i<baseTickers.length; i++) {
    if (baseTickers[i] === threeLetters) {
      return [pair.substr(0, pair.length - 3), baseTickers[i]]
    } else if (baseTickers[i] === fourLetters) {
      return [pair.substr(0, pair.length - 4), baseTickers[i]]
    }
  }
  return "invalid pair"
}

function getTickers() {
  binance.prices((error, ticker) => {
    if (error) {
      console.log(error);
      sendErrorEmail(error)
      return
    }
    if (ticker) {
      return Object.keys(ticker)
    }
  });
}

function placeLimitOrder(symbol, side, retry) {
  var tickers = splitTicker(symbol);

  binance.balance((error, balances) => {
    if (error) {
      console.log(error)
      sendErrorEmail(error);
      return
    } 
    if (balances) {
      if (side === "BUY") {
        var base = tickers[1];
      } else if (side === "SELL") {
        var base = tickers[0];
      }
      binance.depth(symbol, (error, depth) => {
        if (error) {
          console.log(error);
          sendErrorEmail(error);
          return
        }
        var price = Object.keys(depth.bids)[0]
        var balance = balances[base].available.slice(0,5);
        if (side === "BUY") {
          binance.buy(symbol, quantity, price, {type:'LIMIT'}, (error, response) => {
            console.log("Limit Buy response", response);
            console.log("order id: " + response.orderId);
          });
        } else if (side === "SELL") {
          console.log(symbol, balance, price)
          binance.sell(symbol, balance, price, {type:'LIMIT'}, (error, response) => {
            if (error) {
              console.log(error.body)
            }
            if (response) {
              console.log("Limit Buy response", response);
              console.log("order id: " + response.orderId);
            }
          });
        }
      });
    }
  })
}


function placeMarketOrder(symbol, side, retry) {}

placeLimitOrder('ETHBTC', 'SELL')


module.exports = {
  getTickers: getTickers,
  placeLimitOrder: placeLimitOrder,
  placeMarketOrder: placeMarketOrder
}