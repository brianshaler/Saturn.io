
/**
*  Dashboard Controller
*  Created by create-controller script @ Sat Nov 26 2011 12:43:58 GMT-0500 (EST)
**/
var mongoose = require('mongoose'),	
	User = mongoose.model('User'),
	ActivityItem = mongoose.model('ActivityItem'),
	libsaturn = require('../lib/saturn.js'),
	ViewTemplatePath = 'users';

module.exports = {

	/**
	* Index action, returns a list either via the views/dashboards/index.html view or via json
	* Default mapping to GET '/dashboards'
	* For JSON use '/dashboards.json'
	**/
	index: function (req, res, next, me) {
		if (!libsaturn.requires_login(req, res, me)) { return; }
		
		var activity_items = [];
		var params = get_params(req.query);
		var where = {analyzed_at: {"$gt": new Date(Date.now()-86400*1000)}};
		if (params.since) {
			where["created_at"] = {"$gt": new Date(parseInt(params.since)*1000)};
		}
		
		var settings = {name: "dashboard", ratings: {"$exists": 1}, sort_by: "int_created_at desc", url: "/dashboard.json"};
		ActivityItem.find(where)
		.sort("created_at", -1)
		.limit(60)
		.populate("user")
		.populate("characteristics")
		.populate("topics")
		.run(function (err, items) {
			if (!err && items && items.length > 0) {
				activity_items = items;
			}
			switch (req.params.format) {
				case 'json':
					res.send(activity_items);
					break;
				default:
					res.render(ViewTemplatePath + "/dashboard", {activity_items: activity_items, stream: settings});
			}
		});
	},
	// end /dashboard/index
	
	top: function (req, res, next, me) {
		if (!libsaturn.requires_login(req, res, me)) { return; }
		
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
			
			res.render(ViewTemplatePath + "/top", {activity_items: activity_items, stream: settings});
		});
	}
	
};

function get_params (obj) {
	var defaults = {
		format: "html",
		skip: 0,
		count: 15
	};
	
	for (var k in defaults) {
		if (!obj[k]) {
			obj[k] = defaults[k];
		}
	}
	return obj;
}
