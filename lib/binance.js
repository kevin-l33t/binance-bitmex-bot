var binance = require('node-binance-api')().options({
  APIKEY: process.env.BINANCE_API_KEY,
  APISECRET: process.env.BINANCE_API_SECRET
});
var email = require('./email');


var sendBinanceEmail = email.sendBinanceEmail;
var sendBinanceLimitOrderEmail = email.sendBinanceLimitOrderEmail;
var sendBinanceMarketOrderEmail = email.sendBinanceMarketOrderEmail;
var sendBinanceErrorEmail = email.sendBinanceErrorEmail;

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
      sendBinanceErrorEmail(error)
      return
    }
    if (ticker) {
      return Object.keys(ticker)
    }
  });
}

function placeOrder(symbol, side, type, retry) {
  
  var tickers = splitTicker(symbol);
  var stepSize;
  var tickSize;
  var minNotional;

  binance.exchangeInfo((error, data) => {
    if (error) {
      console.log(error, 'errrr')
    } else {
      for (var i=0; i<data.symbols.length; i++) {
        if (data.symbols[i].symbol === symbol) {
          console.log(data.symbols[i].filters)
          for (var x=0; x<data.symbols[i].filters.length; x++) {
            console.log()
            if (data.symbols[i].filters[x].filterType === 'PRICE_FILTER') {
              tickSize = data.symbols[i].filters[x].tickSize;           
            } else if (data.symbols[i].filters[x].filterType === 'LOT_SIZE') {
              stepSize = data.symbols[i].filters[x].stepSize;
            } else if (data.symbols[i].filters[x].filterType === 'MIN_NOTIONAL') {
              minNotional = data.symbols[i].filters[x].minNotional
            }
          }
        }
      }
      binance.cancelOrders(symbol, (error, res) => {
        if (res || error === "No orders present for this symbol") {
          binance.balance((error, balances) => {
            if (error) {
              console.log(error)
              sendBinanceErrorEmail(error);
              return
            } else {
              binance.depth(symbol, (error, depth) => {
                if (error) {
                  sendBinanceErrorEmail(error);
                  return
                }
                binance.cancelOrders(symbol, (error, res) => {
                  if (res || error === "No orders present for this symbol") {
                    if (side === "BUY") {
                      
                      var base = tickers[1];
                      var price = Object.keys(depth.bids)[0]
                      var balance = balances[base].available;
                      var amount = balance / price;
                      var steppedAmount = binance.roundStep(amount, stepSize);
                      var total = steppedAmount * price;

                      if (steppedAmount === 0) {
                        console.log('Not enough funds to make the minimum order quantity')
                        sendBinanceErrorEmail('Not enough funds to make the minimum order quantity')
                        return
                      }

                      if (total < parseFloat(minNotional)) {
                        console.log('Not enough funds to make the minimum order quantity. Minimum order quantity is: ' + minNotional + ". Your attempted order size was: " + total)
                        sendBinanceErrorEmail('Not enough funds to make the minimum order quantity. Minimum order quantity is: ' + minNotional + ". Your attempted order size was: " + total)
                        return
                      }

                      
                      if (type === "market") {
                        binance.marketBuy(symbol, steppedAmount, (error, order) => {
                          if (error) {
                            console.error(error)
                          } else {
                            console.log(order);
                            sendBinanceMarketOrderEmail(order);
                          }
                        });

                      } else {
                        // request that places buy order
                        binance.buy(symbol, steppedAmount, price, {type:'LIMIT'}, (error, response) => {
                          if (error) {
                            console.error(error)
                          } else {
                            sendBinanceLimitOrderEmail(response)
                            var orderCheck = setInterval(function() {
                              binance.orderStatus(symbol, response.orderId, (err, res) => {
                                if (err) {
                                  clearInterval(orderCheck)
                                } else {
                                  if (res.status === 'FILLED') {
                                    sendBinanceLimitOrderEmail(res)
                                    clearInterval(orderCheck)
                                  } else if (res.status === 'CANCELED') {
                                    clearInterval(orderCheck)
                                  }
                                }
                                console.log(err, res)
                              })
                            }, 10000)
                          }
                        });
                      }
                    // request that places sell order
                    } else if (side === "SELL") {
                      var base = tickers[0];
                      var price = Object.keys(depth.asks)[0];
                      var balance = parseFloat(balances[base].available);
                      
                      var steppedBalance = binance.roundStep(balance, stepSize);

                      if (steppedBalance === 0) {
                        console.log('Not enough funds to make the minimum order quantity')
                        sendBinanceErrorEmail('Not enough funds to make the minimum order quantity');
                        return
                      }
                      
                      if (type === "market") {  
                        binance.marketSell(symbol, steppedBalance, (error, order) => {
                          if (error) {
                            console.error(error);
                          } else {
                            console.log(order);
                            sendBinanceMarketOrderEmail(order);
                          }
                        });

                      } else {
                        binance.sell(symbol, steppedBalance, price, {type:'LIMIT'}, (error, response) => {
                          if (error) {
                            console.error(error)
                          } else {
                            sendBinanceLimitOrderEmail(response);
                            var orderCheck = setInterval(function() {
                              binance.orderStatus(symbol, response.orderId, (err, res) => {
                                if (err) {
                                  clearInterval(orderCheck)
                                } else {
                                  if (res.status === 'FILLED') {
                                    sendBinanceLimitOrderEmail(res);
                                    clearInterval(orderCheck);
                                  } else if (res.status === 'CANCELED') {
                                    clearInterval(orderCheck)
                                  }
                                }
                                console.log(err, res)
                              })
                            }, 10000)
                          }
                        });
                      }
                    }
                  } else {
                    console.error(error);
                  }
                })
              });
            }
          })
        } else {
          console.error(error)
        }
      })
    }
  })
}

module.exports = {
  getTickers: getTickers,
  placeOrder: placeOrder,
  binanceApi: binance
}