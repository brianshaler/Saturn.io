/**
 *  Settings schema
 **/
 
var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var Settings = new Schema({
	
	variable: {type: String},
	value: {}, 
	  
});

mongoose.model('Settings', Settings);
