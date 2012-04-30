
/**
*  Topic Controller
**/
var mongoose = require('mongoose'),	
	User = mongoose.model('User'),
	Topic = mongoose.model('Topic'),
	JunkTopic = mongoose.model('JunkTopic'),
	ActivityItem = mongoose.model('ActivityItem'),
	libsaturn = require('../lib/saturn.js'),
	ViewTemplatePath = 'topics';

module.exports = {

	/**
	* Index action, returns a list either via the views/dashboards/index.html view or via json
	* Default mapping to GET '/dashboards'
	* For JSON use '/dashboards.json'
	**/
	index: function (req, res, next, me) {
		if (!libsaturn.requires_login(req, res, me)) { return; }
		
		var activity_items = [];
		
		var recent_topics = [];
		var popular_topics = [];
		
		var from = req.params.from ? parseInt(req.params.from) - 1 : 0;
		var to = req.params.to ? parseInt(req.params.to) : 10;
		
		Topic.find()
		.sort("text", -1)
		.skip(from).limit(to)
		.limit(20)
		.run(function (err, topics) {
			if (!err && topics && topics.length > 0) {
				recent_topics = topics;
			}
			
			res.render(ViewTemplatePath + "/index", {recent_topics: recent_topics});
		});
	},
	
	analyze_trending: function (req, res, next, me) {
		var trending_topics = [];
		
		Topic.find({"activity_1h": {"$gte": 2}, "ratings.overall": {"$gt": -100}}, ['_id', 'text', 'activity_1h', 'activity_24h'])
		.sort('activity_1h', -1)
		.limit(50)
		.run(function (err, topics) {
			if (err || !topics || topics.length == 0) {
				return finished();
			}
			console.log("Analyzing "+topics.length+" topics");
			var _ids = [];
			topics.forEach(function (topic) {
				_ids.push(topic._id);
			});
			topics = topics.map(function (t) {
				var obj = {};
				obj.obj = t;
				obj.activity_1h = t.activity_1h;
				obj.activity_24h = t.activity_24h;
				obj._id = t._id;
				obj.text = t.text;
				return obj;
			});
			var sum = 0;
			topics.forEach(function (topic) {
				sum += topic.activity_24/24;
				topic.d = (topic.activity_1h+topic.activity_1h)/(topic.activity_1h+topic.activity_24h/22);
				topic.d2 = topic.d * topic.activity_1h;
			});
			var avg = sum/topics.length;
			topics.sort(function (a, b) {
				//var da = (a.activity_1h+avg)/(a.activity_24h/24+avg);
				//var db = (b.activity_1h+avg)/(b.activity_24h/24+avg);
				var da = a.d2;
				var db = b.d2;
				return da < db ? 1 : -1;
			});
			//trending_topics = topics;
			
			var count = 0;
			var max = 50;
			
			console.log("Topic ids to re-save: ");
			console.log(_ids);
			
			//var _ids = [];
			Topic.find({_id: {"$in": _ids}}, function (err, topics_to_save) {
				console.log("err");
				console.log(err);
				console.log("topics_to_save "+topics_to_save.length);
				console.log(topics_to_save);
				if (!err && topics_to_save) {
					topics_to_save.forEach(function (save_me) {
						save_me.save(function () {
							console.log("Saved "+topics_to_save.text);
						});
					});
				}
			});
			finished();
		});
		
		function finished () {
			// Hmm...
			switch (req.params.format) {
				case 'json':
					res.send(trending_topics);
					break;
				default:
					res.send("Done");
			}
			//res.send(trending_topics);
		}
	},
	
	trending: function (req, res, next, me) {
		
		var trending_topics = [];
		
		Topic.find({"activity_1h": {"$gt": 2}, "ratings.overall": {"$gt": -1}}, ['text', 'activity_1h', 'activity_24h'])
		.sort('activity_1h', -1)
		.limit(1000)
		.run(function (err, topics) {
			if (err || !topics || topics.length == 0) {
				return finished();
			}
			topics = topics.map(function (t) {
				return t.toObject();
			});
			var sum = 0;
			topics.forEach(function (topic) {
				sum += topic.activity_24/24;
				topic.d = (topic.activity_1h+topic.activity_1h)/(topic.activity_1h+topic.activity_24h/22);
				topic.d2 = topic.d * topic.activity_1h;
			});
			var avg = sum/topics.length;
			topics.sort(function (a, b) {
				//var da = (a.activity_1h+avg)/(a.activity_24h/24+avg);
				//var db = (b.activity_1h+avg)/(b.activity_24h/24+avg);
				var da = a.d2;
				var db = b.d2;
				return da < db ? 1 : -1;
			});
			trending_topics = topics;
			return finished();
			//var min = topics[topics.length-1].activity_1h;
			//Topic.find({"activity_1h": {"$gt": min}, "ratings.overall": {"$gt": -1}}, ['activity_1h'])
		});
		//finished();
		
		function finished () {
			// Hmm...
			switch (req.params.format) {
				case 'json':
					res.send(trending_topics);
					break;
				default:
					res.render(ViewTemplatePath + "/list", {topics: trending_topics});
			}
			//res.send(trending_topics);
		}
	},
	
	popular: function (req, res, next, me) {
		if (!libsaturn.requires_login(req, res, me)) { return; }
		
		var activity_items = [];
		
		var recent_topics = [];
		var popular_topics = [];
		
		var from = req.params.from ? parseInt(req.params.from) - 1 : 0;
		var to = req.params.to ? parseInt(req.params.to) : 10;
		
		Topic.find({"ratings.overall":{"$gte":0}})
		.sort("instances", -1)
		.skip(from).limit(to)
		.limit(20)
		.run(function (err, topics) {
			if (!err && topics && topics.length > 0) {
				//recent_topics = topics;
			} else {
				topics = [];
			}
			
			res.render(ViewTemplatePath + "/list", {topics: topics});
		});
	},
	// end /topic/popular
	
	view: function (req, res, next, me) {
		var id = req.params.id;
		
		Topic.findOne({_id: id})
		.run(function (err, topic) {
			if (!err && topic) {
				
				ActivityItem.find({topics: topic.id})
				.sort('posted_at', -1)
				.limit(20)
				.populate("user")
				.populate("topics")
				.run(function (err, items) {
					if (err || !items) {
						items = [];
					}
					res.render(ViewTemplatePath + "/view", {topic: topic, items: items});
				});
			} else {
				res.redirect("/dashboard");
			}
		});
	},
	// end /topic/view
	
	bytext: function (req, res, next, me) {
		var id = req.params.id;
		
		Topic.findOne({text: id.toLowerCase()}, function (err, topic) {
			if (err) {
				return next(err);
			}
			if (!topic) {
				return res.render("404");
			}
			res.redirect("/topic/view/"+topic.id);
		});
	},
	// end /topic/bytext
	
	rate: function (req, res, next, me) {
		if (!libsaturn.requires_login(req, res, me)) { return; }
		
		if (!req.body || !req.body.topic) {
			_id = req.params.id;
			//return res.redirect("/cron/edit");
			req.body.topic = {};
		}
		
		var is_new = true;
		var _id = req.body.topic._id || req.params.id;
		Topic.findOne({_id: _id}, receive_topic);
		
		function receive_topic (err, topic)
		{
			if (!err && topic && req.body && req.body.topic) {
				console.log("TOPIC/RATE:");
				console.log(req.body);
				topic.ratings.user_input = req.body.topic.ratings.user_input;
				topic.ratings.overall = req.body.topic.ratings.user_input;
				topic.commit("ratings");
				topic.save(function (err) {
					// ERROR?
					if (err) {
						console.log(err);
					}
					ActivityItem.update({topics: topic.id}, {analyzed_at: new Date(Date.now()-86400*1000)}, {multi: true}, function (err) {
						if (err) {
							console.log("UPDATE ERROR: ");
							console.log(err);
						}
					});
					res.redirect("/topic/view/"+topic.id+"?saved");
					//res.render("/cron/edit", {is_new: is_new, task: task});
				});
			} else {
				res.redirect("/topic/view/"+topic.id+"?no_change");
			}
		}
	},
	// end /topic/rate
	
	junk: function (req, res, next, me) {
		if (!libsaturn.requires_login(req, res, me)) { return; }
		
		var id = req.params.id;
		
		Topic.findOne({_id: id})
		.run(function (err, topic) {
			if (!err && topic) {
				
				var j = new JunkTopic({text: topic.text});
				j.save(function (err) {
					ActivityItem.update({topics: id}, {"$pull": {topics: id}}, {multi: true}, function (err) {
						topic.remove();
						res.redirect("/dashboard");
					});
				});
			} else {
				res.redirect("/topic/view/"+id);
			}
		});
		
	},
	// end /topic/junk
};
