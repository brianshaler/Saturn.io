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
	
	var factors = [];
	var likeness = 0;
	var thumbs = this.ratings.dislikes + this.ratings.likes;
	var percent = thumbs < 100 ? thumbs : 100;
	if (this.ratings.dislikes > this.ratings.likes) {
		likeness = -(this.ratings.dislikes-this.ratings.likes)/this.ratings.dislikes*percent;
	}
	if (this.ratings.likes > this.ratings.dislikes) {
		likeness = (this.ratings.likes-this.ratings.dislikes)/this.ratings.likes*percent;
	}
	if (likeness != 0) {
		factors[0] = likeness;
	}
	var sum = 0;
	for (var k in this.ratings) {
		if (parseFloat(this.ratings[k]) != 0 && k != "overall" && k != "likes" && k != "dislikes") {
			
			factors[factors.length] = parseFloat(this.ratings[k]);
		}
	}
	factors.forEach(function (f) { sum += f; });
	this.ratings.overall = factors.length > 0 ? sum / factors.length : 0;
	this.commit("ratings");
}

Identity.pre('save', function (next) {
	this.calculate_rating();
	next();
});


mongoose.model('Identity', Identity);
