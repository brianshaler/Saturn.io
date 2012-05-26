/**
 *  Dashboard Controller
 **/

var mongoose = require('mongoose'),
	conf = require('node-config'),
	crypto = require('crypto');

// Models
var Settings = mongoose.model('Settings'),
	ActivityItem = mongoose.model('ActivityItem');

exports.controller = function(req, res, next) {
	Controller.call(this, req, res, next);
	var self = this;
	
	self.index = function() {
		if (!req.user.isUser) { return res.redirect('/admin/login'); }
		
		var activity_items = [];
		var where = {analyzed_at: {"$gt": new Date(Date.now()-86400*1000)}};
		if (req.query.since) {
			where["created_at"] = {"$gt": new Date(parseInt(params.since)*1000)};
		}
		
		console.log("About to query");
		var settings = {name: "dashboard", ratings: {"$exists": 1}, sort_by: "int_created_at desc", url: "/dashboard.json"};
		ActivityItem.find(where)
		.sort("created_at", -1)
		.limit(20)
		.populate("user")
		.populate("characteristics")
		.populate("topics")
		.run(function (err, items) {
			console.log("got result");
			if (!err && items && items.length > 0) {
				//activity_items = items;
				items.forEach(function (item) {
					var a = item.toObject();
					a.data = null;
					activity_items.push(a);
				});
			}
			
			switch (req.params.format) {
				case 'json':
					res.send(activity_items);
					break;
				default:
					res.render("objects/stream", {activity_items: activity_items, stream: settings});
			}
			//console.log(res.send(activity_items));
			console.log(activity_items.length);
			console.log("SENT! "+req.params.format);
		});
	}
	// end /dashboard/index
	
	self.top = function () {
		var activity_items = [];
		
		var settings = {name: "dashboard", sort_by: "rating desc", url: ""};
		
		ActivityItem.find({posted_at: {"$gt": new Date(Date.now()-86400*1000/6)}})
		.sort("ratings.overall", -1)
		.limit(50)
		.populate("user")
		.populate("characteristics")
		.populate("topics")
		.run(function (err, items) {
			if (!err && items && items.length > 0) {
				activity_items = items;
			}
			
			res.render("object/stream", {activity_items: activity_items, stream: settings});
		});
	}
	// end /dashboard/top
};