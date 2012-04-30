
/**
 *  User Controller
 **/
var sys = require('sys'),
	http = require('http'),
	mongoose = require('mongoose'),
	validator = require('validator'),
	User = mongoose.model('User'),
	//cookie = require('cookie'),
	libsaturn = require('../lib/saturn.js'),
	conf = require('node-config'),
	ViewTemplatePath = 'users';

module.exports = {

	/**
	 * Index action, returns a user either via the views/users/index.html view or via json
	 * Default mapping to GET '/users'
	 * For JSON use '/users.json'
	 **/
	index: function (req, res, next, me) {
		
		  if (!me.isAdmin()) {
			  return res.redirect("/user/login");
			  return res.render("404");
		  }
		  
		  var from = req.params.from ? parseInt(req.params.from) - 1 : 0;
		  var to = req.params.to ? parseInt(req.params.to) : 10;
		  var total = 0;
		  
		  User.count({}, function (err, count) {
			total = count;  
			var pagerHtml = pager.render(from,to,total,'/users');		
					  
			  User.find({})
			  	.sort('name', 1)
			  	.skip(from).limit(to)
			  	.find(function (err, users) {
				
				  if(err) return next(err);
				  
				  switch (req.params.format) {
					case 'json':			  
					  res.send(users.map(function(u) {
						  return u.toObject();
					  }));
					  break;
		
					default:						
						res.render(ViewTemplatePath,{users:users,pagerHtml:pagerHtml});
				  }
				  
			  });
		  
		  });
		  	  	
	},
	
	register: function (req, res, next, me) {
		if (me.isUser()) { return res.redirect("/dashboard"); }
		
		var input = {user_name: "", email: "", password: "", password2: "", zip: ""};
		var errors = [];
		var user;
		
		// fill input object with values from form
		if (req.body) {
			for (var field in req.body) {
				input[field] = req.body[field];
			}
			if (req.body.user) {
				for (var field in req.body.user) {
					input[field] = req.body.user[field];
				}
			}
		}
		
		if (input.user_name != "") {
			if (input.email == "") {
				errors.push("Email cannot be blank.");
			} else {
				var validEmail = false;
				try {
					validEmail = validator.check(input.email).len(6, 64).isEmail();
				} catch (e) {
					errors.push("Email: "+e.message);
				}
			}
			if (input.password == "") {
				errors.push("Password cannot be blank.");
			}
			if (input.password != input.password2) {
				errors.push("Passwords don't match.");
			}
			if (input.zip.length != 5) {
				errors.push("Please enter a 5-digit ZIP");
			}
			if (errors.length > 0) {
				return displayRegisterPage();
			} else {
				User.find({user_name: input.user_name}, function (err, users) {
					if (err) {
						errors.push(err);
						return displayRegisterPage();
					}
				
					var existing = false;
					users.forEach(function (u) {
						existing = u;
					});
				
					if (existing) {
						errors.push("User name exists, please choose another");
						return displayRegisterPage();
					} else {
						user = new User({user_name: input.user_name, email: input.email, zip: input.zip});
						user.registerUser();
						user.setPassword(input.password);
						user.save(function (err) {
							if (err) {
								errors.push(err);
								return displayRegisterPage();
							}
							
							res.setHeader('Set-Cookie', "session_key="+user.getSessionKey()+"; path=/");
							res.setHeader('Set-Cookie', "session_token="+user.generateToken()+"; path=/");
							
							// Registered, redirect to home page
							return res.redirect("/dashboard");
						});
					}
				});
			}
		} else {
			return displayRegisterPage();
		}
		
		function displayRegisterPage () {
			res.render(ViewTemplatePath + "/register", {user: input, errors: errors});
		}
	},
	
	login: function (req, res, next, me) {
		if (me.isUser()) { return res.redirect("/dashboard"); }
		
		var user_name = "";
		var password = "";
		var return_url = "";
		var errors = [];
		
		if (!req.body) { req.body = {}; }
		
		if (req.body.return_url) {
			return_url = req.body.return_url;
		}
		if (req.body.user_name && req.body.password && req.body.user_name != "" && req.body.password != "") {
			user_name = req.body.user_name;
			password = req.body.password;
		} else
		if (req.query && req.query["user_name"] && req.query["password"]) {
			user_name = req.query["user_name"];
			password = req.query["password"];
		}
		
		if (user_name != "" && password != "") {
			User.find({user_name: user_name}, function (err, users) {
				if (err) {
					errors.push("There was a system error, please try again later.");
					return displayLoginPage();
				}
				
				var me = new User;
				
				users.forEach(function (user) {
					if (user.authenticate(password)) {
						me = user;
					}
				});
				
				if (me.isUser()) {
					me.last_activity = new Date();
					me.save();
					res.setHeader('Set-Cookie', "session_key="+me.getSessionKey()+"; path=/");
					res.setHeader('Set-Cookie', "session_token="+me.generateToken()+"; path=/");
					
					// Logged in, redirect to dashboard or return_url
					return res.redirect(return_url != "" ? return_url : "/dashboard");
				} else {
					errors.push("Invalid user name or password");
					return displayLoginPage();
				}
			});
			return;
		}
		displayLoginPage();
		
		function displayLoginPage () {
			res.render(ViewTemplatePath + "/login", {user_name: user_name, errors: errors, return_url: return_url});
		}
	},

	dashboard: function (req, res, next, me) {
		if (!libsaturn.requires_login(req, res, me)) { return; }
		
		res.redirect("/dashboard");
	},
	
	logout: function (req, res, next, me) {
		if (me && me.isUser()) {
			me.session_key = "";
			me.save();
		}
		
		res.setHeader('Set-Cookie', "session_key=null; expires="+new Date( Date.now() - 30 * 24 * 60 * 60 * 1000 ).toUTCString()+"; path=/");
		res.setHeader('Set-Cookie', "session_token=null; expires="+new Date( Date.now() - 30 * 24 * 60 * 60 * 1000 ).toUTCString()+"; path=/");
		
		res.redirect('/');
	},
	
	hash: function (req, res, next, me) {
		var h = "No input..";
		if (req.params.id) {
			h = me.hash(req.params.id);
		}
		res.send(h);
	}
};