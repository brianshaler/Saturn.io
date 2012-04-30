/**
 *  Task schema
 **/
 
var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var Task = new Schema({
    
	controller: {type: String}, 
	method: {type: String}, 
	interval: {type: Number, default: 60},
	attributes: {},
	last_run: {type: Date, default: Date.now},
	next_run: {type: Date, default: Date.now},
	created_at: {type: Date, default: Date.now}
	  
});

mongoose.model('Task', Task);
