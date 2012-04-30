/**
 *  JunkTopic schema
 **/
 
var mongoose = require('mongoose'),
	Schema = mongoose.Schema,
	ObjectId = Schema.ObjectId;

var JunkTopic = new Schema({
	
	text: {type: String, index: true, unique: true, required: true}, 
	created_at: {type: Date, default: Date.now}
	
});

mongoose.model('JunkTopic', JunkTopic);
