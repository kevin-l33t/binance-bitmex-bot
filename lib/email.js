var sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

function sendEmail(message, subject){
	const msg = {
	  to: process.env.NOTIFY_EMAIL,
	  from: 'BitMEX@bot.com',
	  subject: subject,
	  text: message
	};
  console.log(msg)
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
  console.log(orderMsg);
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

function sendBinanceEmail(message, subject){
  const msg = {
    to: process.env.NOTIFY_EMAIL,
    from: 'Binance@bot.com',
    subject: subject,
    text: message
  };
  console.log(msg)
  sgMail.send(msg);
}

function sendBinanceMarketOrderEmail(order) {
  var price = 0;
  for (var i=0; i<order.fills.length; i++) {
    price += parseFloat(order.fills[i].price)
  }
  price = price / order.fills.length;
  var orderMsg = "";
  var subject = "MARKET " + order.side + " order placed/filled for " + order.symbol + "."
  orderMsg += subject + "\n\n";
  orderMsg += "Average Quantity: " + order.executedQty + "\n\n";
  orderMsg += "Order Price: " + price + "\n\n";
  orderMsg += "Order Status: " + order.status + ".";
  sendBinanceEmail(orderMsg, subject);
}

function sendBinanceLimitOrderEmail(order) {
  var orderMsg = "";
  var subject = order.status + " LIMIT " + order.side + " order for " + order.symbol + "."
  orderMsg += subject + "\n\n";
  orderMsg += "Order Quantity: " + order.origQty + "\n\n";
  orderMsg += "Order Price: " + order.price + "\n\n";
  orderMsg += "Order Status: " + order.status + ".";
  sendBinanceEmail(orderMsg, subject);
}

function sendBinanceErrorEmail(e) {
  var subject = "Binance Bot: An Error has Occurred."
  sendBinanceEmail(e, subject);
}



module.exports = {
  sendEmail: sendEmail,
  sendLimitOrderEmail: sendLimitOrderEmail,
  sendMarketOrderEmail: sendMarketOrderEmail,
  sendErrorEmail: sendErrorEmail,
  sendBinanceEmail: sendBinanceEmail,
  sendBinanceLimitOrderEmail: sendBinanceLimitOrderEmail,
  sendBinanceMarketOrderEmail: sendBinanceMarketOrderEmail,
  sendBinanceErrorEmail: sendBinanceErrorEmail
}