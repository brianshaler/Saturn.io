
/**
 *  Users Unit Test
 *  Created by create-test script @ Sat Aug 13 2011 19:49:58 GMT+0000 (UTC)
 **/
/**
 * Dependencies
 */
var     should = require('should')
	  , mongoose = require('mongoose')
	  , example = require('models/User')
	  , Schema = mongoose.Schema
	  , SchemaType = mongoose.SchemaType
	  , ValidatorError = SchemaType.ValidatorError
	  , DocumentObjectId = mongoose.Types.ObjectId
	  , MongooseError = mongoose.Error;

/**
 * Simple expresso tests for the User model
 */
module.exports = {
		    
  'Test that a model can be created': function(){
	    var User = mongoose.model('User');
	    var model = new User();
	    model.isNew.should.be.true;    
   },
  'Test that the model is an instance of a mongoose schema': function(){
    var User = mongoose.model('User');
    User.schema.should.be.an.instanceof(Schema);
    User.prototype.schema.should.be.an.instanceof(Schema);
  },
  'Test that an User has all of the default fields and values': function(){
    
    var User = mongoose.model('User');

    var model = new User();
    model.isNew.should.be.true;

    model.get('_id').should.be.an.instanceof(DocumentObjectId);
    should.equal(undefined, model.get('name'));
    
   },
  'Test that saving a record with invalid fields returns a validation error': function(){
	  
	    var User = mongoose.model('User');	    
	    var model = new User();
	    model.set('name', '');
	    model.save(function(err){
	      
	      err.should.be.an.instanceof(MongooseError);
	      err.should.be.an.instanceof(ValidatorError);
	      
	      model.set('name', 'I exist!');
	      model.save(function(err){
	        should.strictEqual(err, null);
	      });
	      
	    });	    

  }

};