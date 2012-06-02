/**
 *  Topic schema
 **/
 
var mongoose = require('mongoose'),
	Schema = mongoose.Schema,
	ObjectId = Schema.ObjectId;

var Topic = new Schema({
	
	text: {type: String, index: true, unique: true, required: true}, 
	ratings: {},
	instances: {type: Number, default: 0},
	activity_1h: {type: Number, default: 0},
	activity_24h: {type: Number, default: 0},
	updated_at: {type: Date, default: Date.now},
	created_at: {type: Date, default: Date.now}
	
});

Topic.pre('save', function (next) {
	var self = this;
	
	var mongoose = require('mongoose');
	var ActivityItem = mongoose.model('ActivityItem');
	
	if (!self.ratings) {
		self.ratings = {};
	}
	if (!self.ratings.overall) {
		self.ratings.overall = 0;
	}
	if (!self.ratings.likes) {
		self.ratings.likes = 0;
	}
	if (!self.ratings.dislikes) {
		self.ratings.dislikes = 0;
	}
	
	var likes = self.ratings.likes;
	var dislikes = self.ratings.dislikes;
	if (likes == 0 || dislikes == 0) {
		likes *= likes;
		dislikes *= dislikes;
	}
	var factors = [];
	var likeness = 0;
	var thumbs = dislikes + likes;
	var percent = thumbs < 100 ? thumbs : 100;
	percent = percent > 10 ? percent : percent + (10-percent)*.5;
	if (dislikes > likes) {
		likeness = -(dislikes-likes)/dislikes*percent;
	}
	if (likes > dislikes) {
		likeness = (likes-dislikes)/likes*percent;
	}
	if (likeness != 0) {
		factors[0] = likeness;
	}
	var sum = 0;
	for (var k in self.ratings) {
		if (parseFloat(self.ratings[k]) != 0 && k != "overall" && k != "likes" && k != "dislikes") {
			
			factors[factors.length] = parseFloat(self.ratings[k]);
		}
	}
	factors.forEach(function (f) { sum += f; });
	self.ratings.overall = factors.length > 0 ? sum / factors.length : 0;
	self.commit("ratings");
	
	
	
	var HOUR_AGO = new Date(Date.now() - 3600*1000);
	var DAY_AGO = new Date(Date.now() - 86400*1000);
	
	ActivityItem.count({
		topics: self.id, 
		posted_at: {"$gt": new Date(Date.now() - 99*86400*1000)}
	}, function (err, count) {
		if (err || !count) {
			count = 0;
		}
		self.instances = count;
		
		if (!self.updated_at) {
			self.updated_at = new Date(Date.now());
		}
		var last_update = self.updated_at;
		self.updated_at = new Date(Date.now());
		
		// only analyze unique user activity every ~2 mins
		if (last_update.getTime() > self.updated_at.getTime() - .60*1000) {
			return next();
		} else {
			var command = {
				'group' : { //mongodb group command
					'ns' : 'activityitems', //the collection to query
					'cond' : {topics: self._id, posted_at: {"$gt": DAY_AGO}}, //active.end must be in the future
					'initial': {cnt: 0, posted_at: new Date(0)}, //initialize any count object properties
					'$reduce' : 'function(doc, out){ out.cnt++; out.posted_at = doc.posted_at; }', //the reduce function which specifies an iterated 'doc' within the collection and 'out' count object *Note: 'reduce' must prefice by $
					'key' : {user: 1} //fields to group by
				}
			}
			mongoose.connection.db.executeDbCommand(command, function(err, dbres)
			{
				if (err) {
					//console.log(err);
				} else {
					//console.log(dbres);
					if (dbres && dbres.documents && dbres.documents.length >= 1 && dbres.documents[0].retval) {
						self.activity_24h = dbres.documents[0].retval.length;
						var recent = [];
						dbres.documents[0].retval.forEach(function (act) {
							if (act.posted_at > HOUR_AGO) {
								recent.push(act);
							}
						});
						self.activity_1h = recent.length;
						//console.log(dbres.documents[0].retval);
					}
				}
				return next();
			});
			/** /
			ActivityItem.find({
				topics: self.id, 
				posted_at: {"$gt": new Date(Date.now() - 86400*1000)}
			}, ['_id'], {'group': 'user'}, function(err, items) {
				self.activity_24h = items.length;
				ActivityItem.find({
					topics: self.id, 
					posted_at: {"$gt": new Date(Date.now() - 3600*1000)}
				}, ['_id'], {'group': 'user'}, function(err, items) {
					self.activity_1h = items.length;
					return next();
				});
			});
			/**/
		}
	});
});

mongoose.model('Topic', Topic);
