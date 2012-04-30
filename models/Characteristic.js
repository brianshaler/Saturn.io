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
	
	var factors = [];
	var likeness = 0;
	var thumbs = self.ratings.dislikes + self.ratings.likes;
	var percent = thumbs < 100 ? thumbs : 100;
	percent = percent > 10 ? percent : 10;
	if (self.ratings.dislikes > self.ratings.likes) {
		likeness = -(self.ratings.dislikes-self.ratings.likes)/self.ratings.dislikes*percent;
	}
	if (self.ratings.likes > self.ratings.dislikes) {
		likeness = (self.ratings.likes-self.ratings.dislikes)/self.ratings.likes*percent;
	}
	if (self.ratings.likes == 0 || self.ratings.dislikes == 0) {
		likeness *= Math.abs(likeness);
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
