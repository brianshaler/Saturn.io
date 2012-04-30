
/**
*  Stats Controller
**/
var mongoose = require('mongoose'),	
	User = mongoose.model('User'),
	Identity = mongoose.model('Identity'),
	Topic = mongoose.model('Topic'),
	Characteristic = mongoose.model('Characteristic'),
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
		
		ActivityItem.find()
		.sort("created_at", -1)
		.limit(20)
		.populate("user")
		.run(function (err, items) {
			if (!err && items && items.length > 0) {
				activity_items = items;
			}
			
			res.render(ViewTemplatePath + "/dashboard", {activity_items: activity_items});
		});
	},
	// end /stats/index
	
	most_posts: function (req, res, next, me) {
		
		var command = {
			'group' : {
				'ns' : 'activityitems',
				'cond' : {posted_at: {"$gt": new Date(Date.now() - 2*86400*1000)}},
				'initial': {'cnt': 0},
				'$reduce' : 'function(doc, out){ out.cnt++ }',
				'key' : {'user': 1}
			}
		}
		
		mongoose.connection.db.executeDbCommand(command, function(err, dbres)
		{
			if (err) {
				res.send(err);
			}
			var counts = dbres.documents[0].retval;
			counts.sort(function (a, b) {
				return a.cnt < b.cnt ? 1 : -1;
			});
			
			var _ids = [];
			var id_to_count = {};
			counts.forEach(function (c) {
				if (_ids.length < 100) {
					c._id = c._id || c.user;
					_ids.push(c._id);
					id_to_count[c._id] = c.cnt;
				}
			});
			
			var data = [];
			Identity.find({"_id": {"$in": _ids}}, {}, function (err, identities) {
				if (!err && identities) {
					identities.forEach(function (identity) {
						data.push({name: identity.display_name, count: id_to_count[identity._id]});
					});
				} else {
					return res.send(err);
				}
				data.sort(function (a, b) {
					return a.count < b.count ? 1 : -1;
				});
				res.send(data);
			});

		});
		return;
		ActivityItem.find({created_at: {"$gt": new Date(Date.now() - 3600*1000)}}, [], {group: 'user'}, function(err, items) {
			if (err) {
				res.send(err);
			}
			res.send(items);
		});
		
	},
	// end /stats/most_posts
};
