var fs = require('fs')
	, inflection = require('../lib/inflection'),
	mongoose = require('mongoose'),
	tmp = require('../models/User.js'),
	User = mongoose.model('User', tmp.User),
	conf = require('node-config');

var passphrase = "default";

module.exports = function(app) {
	
	// app.get("/favicon.ico", function() {}); // Required if you delete the favicon.ico from public
	
	// Plural
	app.get("/:controller.:format?", router);				// Index
	app.get("/:controller/:from-:to.:format?", router);		// Index
	app.get("/:controller/:action/:from-:to.:format?", router);		// Index
	app.get("/:controller", router);				        // Index
	app.get("/", router);				        // Index
	
	// Plural Create & Delete
	app.post("/:controller", router);			// Create
	app.del("/:controller", router);   			// Delete all
	
	// Singular - different variable to clarify routing
	app.get("/:controller/:action/:id.:format?", router);  	// To support controller/index	
	app.get("/:controller/:action/:id", router);		// Show edit
	app.post("/:controller/:action", router);			// Create
	app.post("/:controller/:action/:id", router);			// Update
	app.put("/:controller/:action/:id", router);				// Update
	app.put("/:controller/:id", router);				// Update
	app.del("/:controller/:id", router);				// Delete
		
	app.get("/:controller/:action.:format?", router);  	// Action with format
	app.get("/:controller/:action", router);		// Action?
}

///
function router(req, res, next) {
	if (req.cookies && req.cookies.session_key && req.cookies.session_token) {
	    if (req.cookies.session_key != "" && req.cookies.session_token != "") {
	        return authenticate(req, res, next, postAuthentication);
        }
    }
    if (req.query && req.query._session_key && req.query._session_token) {
	    if (req.query._session_key != "" && req.query._session_token != "") {
		    if (!req.cookies) { req.cookies = {}; }
	        req.cookies.session_key = req.query._session_key;
	        req.cookies.session_token = req.query._session_token;
	        return authenticate(req, res, next, postAuthentication);
        }
    }
    
    var me = new User;
    postAuthentication(req, res, next, me);
}

function authenticate (req, res, next, callback) {
    var me = new User;
    User.find({session_key: req.cookies.session_key}, function (err, users) {
        if (err || !users) { callback(req, res, next, me); }
        var found = false;
        users.forEach(function (user) {
            if (!found && user.validateSessionToken(req.cookies.session_key, req.cookies.session_token)) {
                me = user;
                //me.last_activity = new Date();
                //me.save();
                found = true;
            }
        });
        callback(req, res, next, me);
    });
}


function postAuthentication (req, res, next, me) {
	var controller = req.params.controller ? req.params.controller : '';
	var action = req.params.action ? req.params.action : '';
	var id = req.params.id ? req.params.id : '';
	var method = req.method.toLowerCase();
	var fn = 'index';
	
	var mobile = false;
	
	var ua = req.headers['user-agent'];
	
	if (/mobile/i.test(ua) || 
            /like Mac OS X/.test(ua) || 
            /Android/.test(ua) || 
            /webOS\//.test(ua)) {
        mobile = true;
    }
	
	if (req.query && req.session && req.query["mobile"]) {
	    req.session.mobile = req.query["mobile"];
    }
    if (req.session && req.session.mobile) {
        mobile = req.session.mobile == "true" ? true : false;
    }

	// TEMPORARILY DISABLE MOBILE
	mobile = false;
    
    res._locals = res._locals || {};
    res._locals.mobile = mobile;
    res._locals.me = me;
    
    req.params._plural = false;
    req.params._authenticated = false;
	
	// Default route
	if(controller.length == 0) {
		index(req,res,next, me);
		return;
	}		
    
	//res.setHeader('Set-Cookie', "stuff=");
    //req.cookies.test = "testing";
    //for (var k in req.cookies) {
    //    str += "<strong>"+k+": </strong>" + req.cookies[k] + "<br /><br />\n";
    //}
	
	// Determine the function to call based on controller / model and method
	if(id.length == 0) {
		
		// We are plural
		switch(method) {
			case 'get':
				if(action.length > 0) {
					fn = action;
				} else {
					fn = 'index';
				}
				break;
			case 'post':
				if(action.length > 0) {
					fn = action;
				} else {
					fn = 'create';
				}
				break;
			case 'delete':
				fn = 'destroyAll';
				break;		
		}		
		
	} else {
		
		// Controller name is now singular, need to switch it back 
		//controller = controller.pluralize();
		
		switch(method) {
			case 'get':
				if(action.length > 0) {
					fn = action;
				} else {
					fn = 'index';
				}
				break;
			case 'put':
				if(action.length > 0) {
					fn = action;
				} else {
					fn = 'update';
				}
				break;
			case 'delete':
				fn = 'destroy';
				break;		
		}		
		
	}
	
	controllerLibrary = null;
	try {
		var controllerLibrary = require('./' + controller.capitalize() + 'Controller');			
	} catch (e) {  }
	// Just in case it's plural...
	if (!controllerLibrary && controller.charAt(controller.length-1) == "s") {
		try {
		    req.params._plural = true;
			var controllerLibrary = require('./' + controller.capitalize().substring(0, controller.length-1) + 'Controller');			
		} catch (e) {  }
	}
	
	if(controllerLibrary && typeof controllerLibrary[fn] === 'function') {
		controllerLibrary[fn](req,res,next, me);		
	} else {
		res.render('404');
	}
	  	
};


/**
 * Default Application index - shows a list of the controllers.
 * Redirect here if you prefer another controller to be your index.
 * @param req
 * @param res
 */
function index(req, res, next, me) {
	/**
	 * If you want to redirect to another controller, uncomment
	 */
	// res.redirect('/controllerName');
	
	var controllers = [];
	
	  fs.readdir(__dirname + '/', function(err, files){
	    
		if (err) throw err;
	    
		files.forEach(function(file){
			if(file != "AppController.js") {
				controllers.push(file.replace('Controller.js','').toLowerCase());
			}
	    });
	    
		if (me.isUser())
		{
			res.redirect('/dashboard');
		} else
		{
		    if (res._locals && res._locals.mobile == true) {
			    res.render('app/index',{controllers:controllers});
	        } else {
			    res.render('app/index',{controllers:controllers});
		    }
		}
	  
	  });	
	
	  	
};