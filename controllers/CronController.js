/**
 *  Cron Controller
 **/
var sys = require('sys'),
	http = require('http'),
	mongoose = require('mongoose'),
	libsaturn = require('../lib/saturn.js'),
	conf = require('node-config');

var	Task = mongoose.model('Task');

module.exports = {
	tick: function(app) {
		var friends_cache_time = 86400;
		var tweets_cache_time = 2600;
		var d = new Date();
		
		Task.findOne({next_run: {"$lt": Date.now()}}, receive_task);
		
		function receive_task (err, task)
		{
			var rand = Math.round(Math.random()*1000);
			if (err || !task)
			{
				return;
			}
			task.last_run = Date.now();
			task.next_run = new Date(Date.now() + task.interval*1000);
			task.save(function (err) {
				var host = "local.saturn.io";
				var port = 3000;
				var client = http.createClient(port, host);
				var url = "/"+task.controller.replace("Controller", "").toLowerCase()+"/"+task.method;
				var rand = Math.round(Math.random()*1000);
	            var request = client.request("GET", url, {host: host, port: port});
				client.addListener('error', function(error) {
					console.log('ERROR: ' + error.message);
				});
	            request.addListener("response", function(response) {
	                var body = "";
	                response.addListener("data", function(data) {
	                    body += data;
	                });
	                response.addListener("end", function() {
						// nothing?
	                });
	                response.addListener("close", function() {
						// nothing?
	                });
	            });
	            request.end();
	            
				/** /
				var controller = require('./'+task.controller);
				try {
					controller[task.method]();
				} catch (e)
				{
					console.log("FAILED!");
				}
				/**/
			});
		}
	},
	
	manage: function (req, res, next, me) {
		if (!libsaturn.requires_login(req, res, me)) { return; }
		
		var tasks = Task.find({}, receive_tasks);
		
		function receive_tasks (err, tasks)
		{
			tasks = tasks || {};
			res.render("cron/manage", {tasks: tasks});
		}
	},
	
	edit: function (req, res, next, me) {
		if (!libsaturn.requires_login(req, res, me)) { return; }
		
		var is_new = true;
		var _id = req.params.id;
		var tasks = Task.findOne({_id: _id}, receive_task);
		
		function receive_task (err, task)
		{
			if (err || !task) {
				task = new Task();
			} else {
				is_new = false;
			}
			res.render("cron/edit", {is_new: is_new, task: task});
		}
	},
	
	modify: function (req, res, next, me) {
		if (!libsaturn.requires_login(req, res, me)) { return; }
		
		if (!req.body || !req.body.task) {
			_id = req.params.id;
			//return res.redirect("/cron/edit");
			req.body.task = {};
		}
		
		var is_new = true;
		var _id = req.body.task._id || req.params.id;
		var tasks = Task.findOne({_id: _id}, receive_task);
		
		function receive_task (err, task)
		{
			if (err || !task) {
				task = new Task();
			} else {
				is_new = false;
			}
			if (req.body && req.body.task) {
				console.log(req.body);
				task.controller = req.body.task.controller;
				task.method = req.body.task.method;
				task.interval = parseInt(req.body.task.interval) || 60;
				task.next_run = task.last_run + task.interval;
				task.save(function (err) {
					// ERROR?
					if (err) {
						console.log(err);
					}
					res.redirect("/cron/edit/"+task.id+"?saved");
					//res.render("/cron/edit", {is_new: is_new, task: task});
				});
			} else {
				res.redirect("/cron/edit/"+task.id+"?no_change");
			}
		}
	},
	
	create: function (req, res, next, me) {
		if (!libsaturn.requires_login(req, res, me)) { return; }
		
		var task = new Task({});
		task.controller = req.body.task.controller;
		task.method = req.body.task.method;
		task.interval = parseInt(req.body.task.interval);
		task.save(function (err) {
			// ERROR?
			res.redirect("/cron/edit/"+task.id);
		});
	},
	
	destroy: function (req, res, next, me) {
		if (!libsaturn.requires_login(req, res, me)) { return; }
		
		var task = Task.findOne({_id: req.body._id}, function (err, task) {
			// ERROR
			
			if (task) {
				task.remove(function (err) {
					res.redirect("/cron/manage");
				});
			}
		});
	}
};