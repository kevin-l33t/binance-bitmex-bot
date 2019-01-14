require('dotenv').config()

var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

function sendEmail(message, email){
	const msg = {
	  to: process.env.NOTIFY_EMAIL
	  from: 'test@example.com',
	  subject: 'Sending with SendGrid is Fun',
	  text: 'and easy to do anywhere, even with Node.js',
	  html: '<strong>and easy to do anywhere, even with Node.js</strong>',
	};
	sgMail.send(msg);
}


app.use(bodyParser.urlencoded({ extended: false }));

app.get('/', function (req, res) {
	res.send('Hello World!');
});

app.post('/trade_notification', function(req, res) {
	console.log(req.body.Body)

})

app.listen(3000, function () {
	console.log('Example app listening on port 3000!');
});

sendEmail();