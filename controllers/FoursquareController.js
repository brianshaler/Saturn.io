/**
 *  Foursquare Controller
 **/

var mongoose = require('mongoose'),
	foursquare_api = require("node-foursquare"),
	url = require('url'),
	conf = require('node-config');

var	Settings = mongoose.model('Settings'),
	Task = mongoose.model('Task'),
	ActivityItem = mongoose.model('ActivityItem'),
	Identity = mongoose.model('Identity'),
	Characteristic = mongoose.model('Characteristic');

exports.controller = function(req, res, next) {
	Controller.call(this, req, res);
	var self = this;
	
	self.platform = "foursquare";
	
	self.setup = function () {
		if (!req.require_authentication()) { return; }
		
		var step = req.params.id;
		var steps = ["app", "connect"];
		var found = false;
		steps.forEach(function (s) {
			if (s == step) {
				found = true;
			}
		});
		if (!found) {
			step = steps[0];
		}
		
		self._get_settings(function (err, fsq) {
			if (err) throw err;
			
			if (step == "connect") { // Step 2: /foursquare/setup/connect
				var is_setup = false;
				if (fsq && fsq.value && fsq.value.access_token) {
					is_setup = true;
				}
				// Show the page for this step
				return self.render('admin/setup/foursquare/connect', {
					layout: "admin/admin-layout",
					locals: {
						title: 'Connect to Foursquare',
						settings: {},
						is_setup: is_setup,
						current_step: step
					}
				});
			} else { // Default is Step 1: /foursquare/setup/app
				if (req.body && req.body.settings && req.body.settings.foursquare) {
					// Process form
					if (!fsq.value) {
						fsq.value = {};
					}
					for (var k in req.body.settings.foursquare) {
						fsq.value[k] = req.body.settings.foursquare[k];
					}
					fsq.commit('value');
					fsq.save(function (err) {
						if (err) throw err;
						
						// Done with this step. Continue!
						res.redirect("/foursquare/setup/connect");
					});
					return;
				} else {
					// Show the page for this step
					return self.render('admin/setup/foursquare/app', {
						layout: "admin/admin-layout",
						locals: {
							title: 'Foursquare',
							settings: fsq.value
						}
					});
				}
			}
		});
	}
	
	
	// FOURSQAURE AUTHENTICATION
	
	// oauth redirect
	self.oauth = function () {
		if (!req.require_authentication()) { return; }
		
		Settings.findOne({option: self.platform}, function(err, fsq) {
			if (err) throw err;
			if (!fsq) fsq = new Settings({option: self.platform});
			
			foursquare = get_foursquare(fsq.value);
			res.writeHead(303, { "location": foursquare.getAuthClientRedirectUrl() });
			res.end();
		});
	}
	
	// oauth callback
	self.auth = function() {
		if (!req.require_authentication()) { return; }
		
		var fsq;
		var foursquare;
		
		Settings.findOne({option: self.platform}, function(err, fsq) {
			if (err) throw err;
			if (!fsq) fsq = new Settings({option: self.platform});
			
			foursquare = get_foursquare(fsq.value);
			
			foursquare.getAccessToken({code: req.query.code}, function (err, access_token) {
				if (err) {
					return res.send("Failed to retrieve Foursquare details. <a href='/foursquare/oauth'>Try again?</a>");
				} else {
					fsq.value.access_token = access_token;
					fsq.commit('value');
					fsq.save(function(err) {
						if (err) {
							return res.send("Foursquare wasn't connected.. Error while saving to the database");
						}
						self.timeline(true);
						return res.redirect("/foursquare/setup/connect");
					});
				}
			});
		});
	}
	
	
	self.timeline = function (silent) {
		//console.log("FoursquareController.js::timeline()");
		var fsq;
		
		Settings.findOne({option: self.platform}, function(err, fsq) {
			if (err) return finished(err);
			if (!fsq || !fsq.value.access_token) return finished("Couldn't find Foursquare settings. Have you set it up yet?");
			
			var access_token = fsq.value.access_token;
			
			Task.findOne({controller: "FoursquareController", method: "timeline"}, function (err, task) {
				if (err || !task) {
					return finished("Couldn't find timeline task");
				}
				var attr = task.attributes || {};
				var afterTimestamp = attr.afterTimestamp || -1;
				var params = {limit: 100};
				if (attr.afterTimestamp) {
					params.afterTimestamp = attr.afterTimestamp;
				}
				
				foursquare = get_foursquare(fsq.value);
				// Another instance of payload being same parameter as err.... shit.
				foursquare.Checkins.getRecentCheckins(params, fsq.value.access_token, function (err, result) {
					
					checkins = result.recent;
					if (!checkins || checkins.length == 0 || !checkins[0]) {
						return finished();
					}
					
					afterTimestamp = checkins[0].createdAt;
					
					process_next_checkin();
					
					function process_next_checkin () {
						if (checkins.length == 0) {
							return finished();
						}
						var checkin = checkins.pop();
						
						self._process_checkin(checkin, function (err) {
							process_next_checkin();
						});
						
					}
					
					attr.afterTimestamp = afterTimestamp;
					task.attributes = attr;
					task.commit("attributes");
					task.save(function (err) {
						// ERROR?
					});
				});
			});
		});
		
		function finished (err) {
			// Hmm...
			if (err) {
				console.log("Error:");
				console.log(err);
			}
			if (!silent) {
				res.send("Done");
			}
		}
	}
	
	self._process_checkin = function (checkin, cb) {
		//console.log("Processing checkin: ");
		//console.log(checkin);
		if (checkin.type != 'checkin') {
			cb();
			return;
		}

		var message = "";
		if (checkin.shout && checkin.shout.length > 0) {
			message = checkin.shout + " @ " + checkin.venue.name;
		} else {
			message = "I'm at " + checkin.venue.name;
		}

		var identity;
		var activity_item = new ActivityItem();
		Identity.findOne({platform: self.platform, platform_id: checkin.user.id}, function (err, identity) {
			if (err || !identity) {
				identity = new Identity();
				identity.photo = [];
			}
			identity.platform = self.platform;
			identity.platform_id = checkin.user.id;
			identity.user_name = checkin.user.firstName + " " + checkin.user.lastName;
			identity.display_name = identity.user_name;
			identity.guid = identity.platform + "-" + identity.platform_id;
			var photo_found = false;
			identity.photo.forEach(function (photo) {
				if (photo.url == checkin.user.photo) {
					photo_found = true;
				}
			});
			if (!photo_found) {
				identity.photo.push({url: checkin.user.photo});
			}
			identity.updated_at = new Date();
			identity.save(function (err) {
				activity_item.platform = self.platform;
				activity_item.guid = activity_item.platform + "-" + checkin.id;
				activity_item.user = identity.id;
				activity_item.message = message;
				activity_item.posted_at = new Date(Date.parse(checkin.createdAt));
				activity_item.analyzed_at = new Date(0);
				activity_item.topics = [];
				activity_item.characteristics = [];
				activity_item.attributes = {};
				activity_item.data = checkin;

				var chars = [];
				chars.push("Foursquare venue: "+checkin.venue.name);
				if (checkin.shout && checkin.shout.length > 0) {
					chars.push("Foursquare shout");
				} else {
					chars.push("Foursquare no shout");
				}

				function add_characteristic () {
					if (chars.length == 0) {
						return save_activity_item();
					}
					ch = chars.shift();
					Characteristic.findOne({text: ch}, function (err, c) {
						if (err || !c) {
							c = new Characteristic({text: ch, ratings: {overall: 0}});
							c.save(function (err) {
								activity_item.characteristics.push(c.id);
								add_characteristic();
							});
						} else {
							activity_item.characteristics.push(c.id);
							add_characteristic();
						}
					});
				}
				add_characteristic();

				function save_activity_item () {
					activity_item.save(function (err) {
						// ERROR?
						activity_item.analyze(function (err, _item) {
							if (!err && _item) {
								_item.save(function (err) {
									//console.log("ActivytItem saved / "+err);
									// ERROR?
								});
							}
							if (cb) {
								//console.log("Finished: "+checkin.text.substring(0, 50));
								cb();
							}
						});
					});
				}
			});
		});
	}
	
	self._get_settings = function (cb) {
		Settings.findOne({option: self.platform}, function(err, s) {
			if (err) return cb(err);

			if (!s) {
				s = new Settings({option: self.platform, value: {}});
			}
			cb(null, s);
		});
	}
	
}

function get_foursquare (settings) {
	var config = {
		"secrets" : {
			"clientId" : settings.client_id,
			"clientSecret" : settings.client_secret,
			"redirectUrl" : settings.callback_url
		}
	}
	return foursquare_api(config);
}
