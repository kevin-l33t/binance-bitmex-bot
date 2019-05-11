var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var trade = require('./trade');

var cronJob = require('./cron');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get('/', function (req, res) {
  console.log('working')
  res.send('Hello World!');
});

// where text messages are sent
app.post('/trade_notification', function (req, res) {
  var tradeNotification = req.body.Body.toLowerCase();
  console.log('NOTIFICATION: ', tradeNotification)
  trade(tradeNotificationm);
  res.sendStatus(200);
});

var server_port = process.env.PORT || 3000;

app.listen(server_port, function () {
  console.log('BitMEX leverage bot is listening on port: ' + server_port);
});

cronJob.start();

// setTimeout(function(){
//   bitmexSellOrder('XBTUSD', process.env.RETRY);
// },3000)
