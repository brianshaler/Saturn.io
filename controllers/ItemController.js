/**
 *  Item Controller
 **/

var mongoose = require('mongoose'),	
	Identity = mongoose.model('Identity'),
	Topic = mongoose.model('Topic'),
	Characteristic = mongoose.model('Characteristic'),
	ActivityItem = mongoose.model('ActivityItem'),
	ViewTemplatePath = 'objects';

exports.controller = function(req, res, next) {
	Controller.call(this, req, res, next);
	var self = this;

	self.view = function () {
		var id = req.params.id;
		
		ActivityItem.findOne({_id: id})
		.populate("user")
		.populate("topics")
		.populate("characteristics")
		.run(function (err, item) {
			if (!err && item) {
				res.render("objects/activity_item", {layout: "dashboard/dashboard-layout", item: item});
			} else {
				res.redirect("/dashboard");
			}
		});
	}
	// end /item/view
	
	self.like = function () {
		var id = req.params.id;
		var redirect_url = "/dashboard";
		
		ActivityItem.findOne({_id: id})
		.run(function (err, item) {
			if (!err && item) {
				//item.analyzed_at = new Date(Date.now() - 86400*1000);
				item.save(function (err) {
					Topic.find({_id: {"$in": item.topics}}, function (err, topics) {
						if (!err && topics) {
							topics.forEach(function (f) {
								f.ratings.likes++;
								f.save(function (err) {
									console.log("Just liked "+f.text);
									// err?
								});
							});
						}
						Characteristic.find({_id: {"$in": item.characteristics}}, function (err, chars) {
							if (!err && chars) {
								chars.forEach(function (c) {
									c.ratings.likes++;
									c.save(function (err) {
										// err?
									});
								});
							}
							Identity.findOne({_id: item.user}, function (err, user) {
								// TEMPORARY, save to get ratings set
								user.calculate_rating();
								user.ratings.likes++;
								user.save(function (err) {
									redirect_url = "/item/view/"+item.id;
									item.analyzed_at = new Date();
									item.analyze(function (err, _item) {
										_item.save(function (err) {
											// err?
											return finished();
										});
									});
								});
							});
						});
					});
				});
			} else {
				return finished();
			}
		});
		
		function finished () {
			switch (req.params.format) {
				case 'json':
					res.send({status: "success"});
					break;
				default:
					res.redirect(redirect_url);
			}
		}
	}
	// end /item/like
	
	self.dislike = function () {
		var id = req.params.id;
		var redirect_url = "/dashboard";
		
		ActivityItem.findOne({_id: id})
		.run(function (err, item) {
			if (!err && item) {
				item.analyzed_at = new Date(Date.now() - 3600*1000);
				item.save(function (err) {
					Topic.find({_id: {"$in": item.topics}}, function (err, topics) {
						if (!err && topics) {
							topics.forEach(function (f) {
								f.ratings.dislikes++;
								f.save(function (err) {
									// err?
								});
							});
						}
						Characteristic.find({_id: {"$in": item.characteristics}}, function (err, chars) {
							if (!err && chars) {
								chars.forEach(function (c) {
									c.ratings.dislikes++;
									c.save(function (err) {
										// err?
									});
								});
							}
							Identity.findOne({_id: item.user}, function (err, user) {
								user.calculate_rating();
								user.ratings.dislikes++;
								user.save(function (err) {
									redirect_url = "/item/view/"+item.id;
									item.analyzed_at = new Date();
									item.analyze(function (err, _item) {
										_item.save(function (err) {
											// err?
											return finished();
										});
									});
								});
							});
						});
					});
				});
			} else {
				return finished();
			}
		});
		
		function finished () {
			switch (req.params.format) {
				case 'json':
					res.send({status: "success"});
					break;
				default:
					res.redirect(redirect_url);
			}
		}
	}
	// end /item/like
	
	self.add_topic = function () {
		var id = req.params.id;
		var text = "";
		
		if (req.query && req.query.text) {
			text = req.query.text.toLowerCase();
		}
		
		if (text.length > 0) {
			ActivityItem.findOne({_id: id}, function (err, item) {
				if (!err && item) {
					Topic.findOne({text: text}, function (err, topic) {
						if (err) {
							// err?
							finished(err);
						} else
						if (topic) {
							add_and_save(topic._id);
						} else
						{
							var topic = new Topic({text: text, ratings: {overall: 0}});
							topic.save(function (err) {
								add_and_save(topic._id);
							});
						}
					});
				} else {
					finished("Couldn't find the item");
				}
				
				function add_and_save (_id) {
					var found = false;
					item.topics.forEach(function (t) {
						if (String(t) == String(_id)) {
							found = true;
						}
					});
					if (!found) {
						item.topics.push(_id);
					}
					console.log("Saving "+item.topics.length+" topics onto item");
					item.analyzed_at = new Date(Date.now() - 3600*1000);
					item.save(function (err) {
						finished(err);
					});
				}
			});
		} else {
			finished("No topic to add?");
		}
		
		function finished (err) {
			switch (req.params.format) {
				case 'json':
					res.send({status: "success",message:err});
					break;
				default:
					res.redirect("/dashboard");
			}
		}
	}
	// end /item/add_topic
	
	self.reanalyze = function () {
		var id = req.params.id;
		
		ActivityItem.findOne({_id: id}, function (err, item) {
			if (!err && item) {
				item.analyzed_at = new Date(Date.now() - 3600*1000);
				item.save(function (err) {
					res.redirect("/item/view/"+item.id);
				});
			} else {
				res.redirect("/dashboard");
			}
		});
	}
	
};
