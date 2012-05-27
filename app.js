/**
 * Base application
 */

var express = require('express'),
	fs = require('fs'),
	querystring = require('querystring'),
	mongoose = require('mongoose'),
	conf = require('node-config'),
	crypto = require('crypto'),
	cron = require('cron').CronJob;


var SessionMongoose = require('session-mongoose');
var mongooseSessionStore;

var app = module.exports = express.createServer();

// Asynchronously load config settings then finish booting app
conf.initConfig(function(err) {
	if (err) throw err;
	
	mongooseSessionStore = new SessionMongoose({
	    url: conf.db
	});
	
	// Configuration
	app.configure(function(){
		app.set('views', __dirname + '/views');
		app.set('view engine', 'ejs');
		app.use(express.cookieParser());
		app.use(express.session({
			cookie: {maxAge: 1000 * 86400 * 365 * 5},
			secret: conf.secret,
			store: mongooseSessionStore // Or Redis?
		}));
		// flash messages
		app.use(function (req, res, next) {
			req.flash = function (message) {
				if (!req.session.messages || !(req.session.messages.length > 0)) {
					req.session.messages = [];
				}
				req.session.messages.push(message);
			}
			req.message_text = "";
			if (req.session.messages && req.session.messages.length > 0) {
				req.messages = req.session.messages;
				req.session.messages = [];
			} else {
				req.messages = [];
			}
			if (req.messages && req.messages.length > 0) {
				res.partial("app/message", {messages: req.messages}, function (err, str) {
					if (err) throw err;
					req.message_text = str;
					next();
				});
			} else {
				next();
			}
		});
		// flash message helper function
		app.dynamicHelpers({flash_message: function (req, res) {
			return function () {
				return req.message_text;
			}
		}});
		app.use(express.bodyParser());
		app.use(express.methodOverride());
		// auth
		app.use(function(req, res, next){
			req.is_user = false;
			req.require_authentication = function () {
				if (req.is_user == true) {
					return true;
				}
				res.redirect('/admin/login?'+querystring.stringify({redirect_url: req.url}));
				return false;
			}
			if (req.session.session_key) {
				Settings = mongoose.model('Settings');
				Settings.findOne({option: "app"}, function (err, s) {
					if (!err && s) {
						if (s.value.session_key && s.value.session_key == req.session.session_key) {
							var correct_token = crypto.createHash('sha1').update(req.session.user_name+"|"+req.session.session_key).digest('hex');
							if (req.session.session_token == correct_token) {
								req.is_user = true;
							}
						}
					}
					next();
				});
			} else {
				next();
			}
		});
		
		// Example 500 page
		app.error(function(err, req, res){
			res.render('500',{error:err});
		});
	});
	
	app.configure('development', function(){
		app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
	});
	
	app.configure('production', function(){
		app.use(express.errorHandler());
	});
	
	// Models
	mongoose.connect(conf.db);
	fs.readdir(__dirname + '/models', function(err, files){
		if (err) throw err;
		files.forEach(function(file){
			require(__dirname + '/models/'+ file)
		});
		
		// Routes
		require('./controllers/index.js').init(app, function () {
			// Example 404 page via simple Connect middleware
			//app.use(app.router);
			app.use(express.static(__dirname + '/public'));
			app.use(function(req, res){
				res.render('404');
			});
		});
		
		app.listen(conf.port, function(){
			console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
		});
		// every 5 seconds
		cron('*/5 * * * * *', function () {
			try {
				var controller = require('./controllers/index');
				controller._tick(app);
			} catch (ex) {
				console.log("Something really bad happened... ");
				console.log(ex);
			}
		});
		
	});
}, 'conf');
