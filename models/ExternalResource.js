/**
 *  ExternalResource schema
 **/
 
var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var ExternalResource = new Schema({
    
	url: {type: String, index: true, required: true, unique: true}, 
	short_urls: [{type: String}], 
	title: {type: String},
	content: {type: String},
	images: [{}],
	topics: [{type: ObjectId, ref: "Topic"}],
	crawled: {type: Boolean, default: false},
	crawled_at: {type: Date},
	created_at: {type: Date, default: Date.now}
	
});

mongoose.model('ExternalResource', ExternalResource);
