// require('dotenv').config();

var bitmex = require('./lib/bitmex');
var binance = require('./lib/binance');
var email = require('./lib/email');

var binanceAPI = require('node-binance-api')().options({
    APIKEY: process.env.BINANCE_API_KEY,
    APISECRET: process.env.BINANCE_API_SECRET
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
            console.log(binancePairs)
        }
    });
}

getTickers();

var bitmexBuyOrder = bitmex.buyOrder;
var bitmexSellOrder = bitmex.sellOrder;

var binanceOrder = binance.placeOrder;

function trade(tradeNotification) {
    if (tradeNotification.includes('bitmex')) {
        if (tradeNotification.includes('BUY')) {
            for (var i = 0; i < bitmexPairs.length; i++) {
                // console.log(bitmexPairs[i].toLowerCase(), tradeNotification)
                if (tradeNotification.includes(bitmexPairs[i])) {
                    console.log('bitmex buy order')
                    bitmexBuyOrder(bitmexPairs[i], process.env.RETRY)
                    return
                }
                email.sendTextErrorEmail("Bitmex bot could not identify a pair to buy or sell based on the text message. Make sure each text includes a pair string WITHOUT a '/', like so 'ethpax' (not case sensitive). Here is the message you sent: \n" + tradeNotification)
            }
        } else if (tradeNotification.includes('SELL')) {
            for (var i = 0; i < bitmexPairs.length; i++) {
                if (tradeNotification.includes(bitmexPairs[i])) {
                    console.log('bitmex sell order')
                    bitmexSellOrder(bitmexPairs[i], process.env.RETRY)
                    return
                }
                email.sendTextErrorEmail("Bitmex bot could not identify a pair to buy or sell based on the text message. Make sure each text includes a pair string WITHOUT a '/', like so 'ethpax' (not case sensitive). Here is the message you sent: \n" + tradeNotification)
            }
        } else {
            email.sendTextErrorEmail("Bot could not identify whether to buy or sell based on the text message. Make sure each text includes the string 'buy' or 'sell' (not case sensitive). Here is the message you sent: \n" + tradeNotification)
        }
    } else if (tradeNotification.includes('Binance')) {
        if (tradeNotification.includes('BUY')) {
            for (var i = 0; i < binancePairs.length; i++) {
                if (tradeNotification.includes(binancePairs[i])) {
                    console.log('binance buy order')
                    binanceOrder(binancePairs[i], 'BUY', process.env.BINANCE_ORDER_TYPE, process.env.RETRY)
                } else {
                    if (i === binance.length - 1) {
                        email.sendTextErrorEmail("Binance bot could not identify a pair to buy or sell based on the text message. Make sure each text includes a pair string WITHOUT a '/', like so 'ethpax' (not case sensitive). Here is the message you sent: \n" + tradeNotification)
                    }
                }
            }
        } else if (tradeNotification.includes('SELL')) {
            for (var i = 0; i < binancePairs.length; i++) {
                if (tradeNotification.includes(binancePairs[i])) {
                    console.log('binance sell order')
                    binanceOrder(binancePairs[i], 'SELL', process.env.BINANCE_ORDER_TYPE, process.env.RETRY)
                } else {
                    if (i === binance.length - 1) {
                        email.sendTextErrorEmail("Binance bot could not identify a pair to buy or sell based on the text message. Make sure each text includes a pair string WITHOUT a '/', like so 'ethpax' (not case sensitive). Here is the message you sent: \n" + tradeNotification)
                    }
                }
            }
        } else {
            email.sendTextErrorEmail("Bot could not identify whether to buy or sell based on the text message. Make sure each text includes the string 'buy' or 'sell' (not case sensitive). Here is the message you sent: \n" + tradeNotification)
        }
    } else {
        email.sendTextErrorEmail("Bot could not identify which exchange to use based on the text message. Please make sure each text includes 'bitmex' or 'binance' (this is not case sensitive). Here is the message you sent: \n" + tradeNotification);
    }
}

module.exports = trade;