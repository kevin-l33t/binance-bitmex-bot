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

module.exports = {
  sendEmail: sendEmail,
  sendLimitOrderEmail: sendLimitOrderEmail,
  sendMarketOrderEmail: sendMarketOrderEmail,
  sendErrorEmail: sendErrorEmail
}