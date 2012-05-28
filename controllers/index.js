Controller = function(req, res, next) {
	this.render = function(template, options) {
		return res.render(template, options);
	}
	
	this.send = function(content) {
		return res.send(content);
	}
	
	this.extend = function(child) {
	    for(var p in child) this[p] = child[p];
		return this;
	}
}

var mongoose = require('mongoose');
var index = function(req, res, next) {
	var Settings = mongoose.model('Settings');
	if (req.is_user) {
		res.redirect('/dashboard');
	} else {
		var not_setup = false;
		
		Settings.findOne({option: "app"}, function(err, s) {
			if (err) throw err;
			
			if (!s || !(s.value.setup_step > 0)) {
				not_setup = true;
			}
			if (not_setup == true) {
				res.redirect('/admin/setup');
			} else {
				res.render('landing-page', { layout: false });
			}
		});
	}
}

function addRoutes (app, controller, callback) {
	app.get('/' + controller + '/:action?/:id?.:format?', callback);
	app.post('/' + controller + '/:action?/:id?.:format?', callback);
	app.get('/' + controller + '/:action?.:format?', callback);
	app.post('/' + controller + '/:action?.:format?', callback);
}

// Create routes based on controllers & methods
exports.init = function(app, next) {
	var fs = require('fs');
	// get all js files in controllers subfolder
	fs.readdir(__dirname, function(err, files) {
		if (err) {
			console.log("Error reading controllers directory");
			console.log(err);
			return next();
		}
		files.forEach(function(filename) {
			if(/Controller.js$/.test(filename)) {
				var file = require('./'+filename);
				
				// add the standard route
				addRoutes(app, filename.replace(/Controller\.js$/, '').toLowerCase(), function(req, res, next) {
					var controller = new file.controller(req, res, next);
					if(!req.params.action) {
						req.params.action = "index";
					} else {
						req.params.action = req.params.action.toLowerCase();
					}
					// try to call the action
					if (typeof controller[req.params.action] == 'function' && !(/^_+/.test(req.params.action))) {
						controller[req.params.action]();
					} else {
						res.render('404');
					}
					delete controller;
				});
			}
		});
		app.get('/', index);
		return next();
	});
}

// Cron / Task
exports._tick = function(app) {
	
	var mongoose = require('mongoose');
	var Task = mongoose.model("Task");
	
	Task.findOne({next_run: {"$lt": Date.now()}}, function (err, task)
	{
		if (err) throw err;
		
		var rand = Math.round(Math.random()*1000);
		if (!task)
		{
			return;
		}
		
		task.last_run = Date.now();
		task.next_run = new Date(Date.now() + task.interval*1000);
		task.save(function (err) {
			var mock = {};
			mock.send = function () { };
			mock.render = function () { };
			mock.redirect = function () { };
			mock.params = {};
			mock.user = {isUser: true};
			var file = require('./'+task.controller);
			try {
				var controller = new file.controller(mock, mock);
				controller[task.method]();
			} catch (e) {
				throw e;
			}
		});
	});
	
}