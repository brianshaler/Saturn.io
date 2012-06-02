/**
 *  Search Controller
 **/

var mongoose = require('mongoose'),	
	Identity = mongoose.model('Identity'),
	Topic = mongoose.model('Topic'),
	Characteristic = mongoose.model('Characteristic'),
	ActivityItem = mongoose.model('ActivityItem');

exports.controller = function(req, res, next) {
	Controller.call(this, req, res, next);
	var self = this;
	
	self.nav_items = [{group: "default", url: "/search", text: "Search"}];
	
	self.index = function () {
		res.render("dashboard/search", {
			layout: "dashboard/dashboard-layout"
		});
	}
	
	self.all = function () {
		var q = String(req.query.q);
		var words = q.split(" ");
		var results = {};
		
		// Flow control
		var step = 0;
		next_step();
		function next_step (err, _results) {
			if (err) throw err;
			if (_results) {
				for (key in _results) {
					results[key] = _results[key];
				}
			}
			step++;
			switch (step) {
				case 1:
					self._find_items(words, next_step);
					break;
				case 2:
					self._find_users(words, next_step);
					break;
				case 3:
					self._find_topics(words, next_step);
					break;
				default:
					finished();
			}
		}
		
		function finished (err) {
			if (err) {
				console.log(err);
				res.send(err);
			} else {
				res.send(results);
			}
		}
	}
	
	self.users = function () {
		var q = String(req.query.q);
		var words = q.split(" ");
		var results = {};
		self._find_users(words, finish);
		
		function finish (err, results) {
			if (err) {
				console.log(err);
				res.send(err);
			} else {
				res.send(results);
			}
		}
	}
	
	
	self._find_items = function (words, cb) {
		var results = {items: []};
		var where = {};
		var _and = get_where_array(words, "message");
		if (_and.length == 0) {
			return cb(null, results);
		} else
		if (_and.length == 1) {
			where = _and[0];
		} else {
			where["$and"] = _and;
		}
		ActivityItem.find(where)
		.sort("posted_at", -1)
		.limit(20)
		.populate("user")
		.populate("topics", ["text", "ratings", "instances"])
		.populate("characteristics", ["text", "ratings"])
		.run(function (err, items) {
			if (err) {
				return cb(err);
			}
			
			items.forEach(function (item) {
				item.data = undefined;
			});
			
			results.items = items;
			return cb(null, results);
		});
	}
	
	self._find_users = function (words, cb) {
		var results = {users: []};
		var where = {};
		var _or = get_where_array(words, "display_name").concat(get_where_array(words, "user_name"));
		if (_or.length == 0) {
			return cb(null, results);
		} else
		if (_or.length == 1) {
			where = _or[0];
		} else {
			where["$or"] = _or;
		}
		Identity.find(where)
		.sort("ratings.overall", -1, "updated_at", -1)
		.limit(20)
		.run(function (err, users) {
			if (err) {
				return cb(err);
			}
			
			results.users = users;
			return cb(null, results);
		});
	}
	
	self._find_topics = function (words, cb) {
		var results = {topics: []};
		var where = {};
		var _and = get_where_array(words, "text");
		if (_and.length == 0) {
			return cb(null, results);
		} else
		if (_and.length == 1) {
			where = _and[0];
		} else {
			where["$and"] = _and;
		}
		Topic.find(where)
		.sort("instances", -1)
		.limit(20)
		.run(function (err, topics) {
			if (err) {
				return cb(err);
			}
			
			results.topics = topics;
			return cb(null, results);
		});
	}
}

function get_where_array (words, key) {
	var arr = [];
	words.forEach(function (w) {
		if (w.length > 0) {
			var obj = {};
			obj[key] = new RegExp(w, "i");
			arr.push(obj);
		}
	});
	return arr;
}
