/**
 *  TwitterUser schema
 **/
 
var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var TwitterUser = new Schema({
    
    user: {type: ObjectId, index: true, ref: "User"}, 
	access_token_key: {type: String}, 
	access_token_secret: {type: String}, 
	profile: {
		id: {type: Number}, 
		following: {type: Boolean}, 
		default_profile_image: {type: Boolean}, 
		show_all_inline_media: {type: Boolean}, 
		profile_use_background_image: {type: Boolean}, 
		id_str: {type: String}, 
		profile_text_color: {type: String}, 
		notifications: {type: Boolean}, 
		favourites_count: {type: Number}, 
		profile_image_url: {type: String}, 
		profile_image_url_https: {type: String}, 
		followers_count: {type: Number}, 
		screen_name: {type: String}, 
		utc_offset: {type: Number}, 
		profile_sidebar_border_color: {type: String}, 
		statuses_count: {type: Number}, 
		name: {type: String}, 
		protected: {type: Boolean}, 
		profile_background_tile: {type: Boolean}, 
		default_profile: {type: Boolean}, 
		profile_sidebar_fill_color: {type: String}, 
		follow_request_sent: {type: Boolean}, 
		time_zone: {type: String}, 
		description: {type: String}, 
		url: {type: String}, 
		profile_background_image_url_https: {type: String}, 
		created_at: {type: String}, 
		lang: {type: String}, 
		listed_count: {type: Number}, 
		profile_background_color: {type: String}, 
		friends_count: {type: Number}, 
		profile_background_image_url: {type: String}, 
		contributors_enabled: {type: Boolean}, 
		is_translator: {type: Boolean}, 
		geo_enabled: {type: Boolean}, 
		location: {type: String}, 
		profile_link_color: {type: String}, 
		verified: {type: Boolean} 
	},
	friends: [{type: ObjectId, ref: "TwitterUser"}],
	friends_fetched_at: {type: Date, index: true, default: new Date(Date.now()-86400*1000)},
	followers: [{type: ObjectId, ref: "TwitterUser"}],
	followers_fetched_at: {type: Date, index: true, default: new Date(Date.now()-86400*1000)},
	tweets: [{type: ObjectId, ref: "TwitterTweet"}],
	tweets_fetched_at: {type: Date, index: true, default: new Date(Date.now()-86400*1000)},
	created_at: {type: Date, default: Date.now}
	  
});

mongoose.model('TwitterUser', TwitterUser);
