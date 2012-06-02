/**
 *  Identity schema
 **/

var mongoose = require('mongoose'),
	Schema = mongoose.Schema,
	ObjectId = Schema.ObjectId;

var Identity = new Schema({
	
	guid: {type: String, unique: true, index: true, required: true},
	platform: {type: String},
	platform_id: {type: String},
	user_name: {type: String},
	display_name: {type: String},
	photo: [{}],
	bio: {type: String},
	attributes: {},
	notes: {type: String},
	ratings: {},
	urls: [{}],
	location_text: {type: String},
	home_location: [Number],
	last_outbound_interaction: {type: Date},
	last_inbound_interaction: {type: Date},
	closeness: {type: Number, default: 0},
	updated_at: {type: Date, default: Date.now},
	created_at: {type: Date, default: Date.now}
	
});

Identity.methods.calculate_rating = function () {
	if (!this.ratings) {
		this.ratings = {};
	}
	if (!this.ratings.overall) {
		this.ratings.overall = 0;
	}
	if (!this.ratings.likes) {
		this.ratings.likes = 0;
	}
	if (!this.ratings.dislikes) {
		this.ratings.dislikes = 0;
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
	this.commit("ratings");
}

Identity.pre('save', function (next) {
	this.calculate_rating();
	next();
});


mongoose.model('Identity', Identity);
