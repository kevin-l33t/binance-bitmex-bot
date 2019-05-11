const CronJob = require('cron').CronJob;
const imaps = require('imap-simple');
var trade = require('./trade');
var _ = require('lodash');

const jobImap = new CronJob('*/15 * * * * *', () => {
	const d = new Date();
    console.log('checking emails :', d);
    
    var config = {
        imap: {
            user: process.env.TRIGGER_EMAIL,
            password: process.env.TRIGGER_EMAIL_PASSWORD,
            host: process.env.TRIGGER_EMAIL_HOST,
            port: 993,
            tls: true,
            authTimeout: 5000
        }
    };
    
    imaps.connect(config).then((connection) => {
    
        return connection.openBox('INBOX').then(function () {
            var searchCriteria = [
                'UNSEEN'
            ];
    
            var fetchOptions = {
                bodies: ['HEADER', 'TEXT'],
                markSeen: true
            };
    
            return connection.search(searchCriteria, fetchOptions).then(function (messages) {
                messages.forEach(function (item) {
                    let textParts = _.find(item.parts, { "which": "TEXT" })
                    trade(textParts.body);
                    // console.log(textParts.body);
                });
                connection.end();
            });
        });
    });
});

module.exports = jobImap;