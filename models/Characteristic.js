/**
 *  Characteristic schema
 **/
 
var mongoose = require('mongoose'),
	Schema = mongoose.Schema,
	ObjectId = Schema.ObjectId;

var Characteristic = new Schema({
	
	text: {type: String, index: true}, 
	value: {},
	ratings: {},
	created_at: {type: Date, default: Date.now}
	
});

Characteristic.pre('save', function (next) {
	var self = this;
	
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
	
	next();
});

mongoose.model('Characteristic', Characteristic);
