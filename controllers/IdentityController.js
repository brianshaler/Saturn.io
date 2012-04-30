
/**
 *  User Controller
 **/
var sys = require('sys'),
	http = require('http'),
	mongoose = require('mongoose'),
	validator = require('validator'),
	Identity = mongoose.model('Identity'),
	ActivityItem = mongoose.model('ActivityItem'),
	libsaturn = require('../lib/saturn.js'),
	conf = require('node-config'),
	ViewTemplatePath = 'identity';

module.exports = {

	/**
	 * View action, returns a single item via views/identity/view.html view or via json
	 * Default mapping to GET '/user/:id'
	 * For JSON use '/user/:id.json'
	 **/	
	view: function (req, res, next, me) {
		var display = {
			identity: false,
			items: false
		};
		Identity.find({_id: req.params.id})
		.findOne(function(err, identity) {
			if(err) return next(err);
			if (!identity) {
				return res.render("404");
			}
			display.identity = identity;
			ActivityItem.find({user: identity.id})
			.sort('posted_at', -1)
			.limit(20)
			.populate("user")
			.populate("topics")
			.run(function (err, items) {
				if (err || !items) {
					items = [];
				}
				display.items = items;
				display_page();
			});
		});
		
		function display_page () {
			switch (req.params.format) {
				case 'json':
					res.send(identity.toObject());
					break;
				default:
					res.render(ViewTemplatePath + "/view", display);
			}
		}
	},
	// end /identity/view
	
	byusername: function (req, res, next, me) {
		var id = req.params.id;
		
		Identity.findOne({user_name: id}, function (err, identity) {
			if (err) {
				return next(err);
			}
			if (!identity) {
				return res.render("404");
			}
			res.redirect("/identity/view/"+identity.id);
		});
	},
	// end /identity/byusername
	
	closeness: function (req, res, next, me) {
		var id = req.params.id;
		
		Identity.findOne({_id: id})
		.run(function (err, identity) {
			if (!err && identity && req.body && req.body.identity) {
				identity.closeness = req.body.identity.closeness;
				
				identity.save(function (err) {
					ActivityItem.update({user: id}, {analyzed_at: new Date(Date.now()-86400*1000)}, {multi: true}, function (err) {
						res.redirect("/identity/view/"+identity.id);
					});
				});
			} else {
				res.redirect("/dashboard");
			}
		});
	}
	// end /identity/closeness
	
};