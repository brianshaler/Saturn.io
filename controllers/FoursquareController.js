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
	
	self.tasks = [
		{controller: "FoursquareController", method: "timeline", interval: 120}
	];
	
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
		
		function check_tasks (cb) {
			if (self.tasks.length == 0) {
				cb(); return;
			}
			var ors = [];
			self.tasks.forEach(function (task) {
				ors.push({controller: task.controller, method: task.method});
			});
			var where = {"$or": ors};
			Task.find(where, function (err, existing) {
				if (err) throw err;
				
				self.tasks.forEach(function (t) {
					var found = false;
					existing.forEach(function (et) {
						if (t.controller == et.controller && t.method == et.method) {
							found = true;
						}
					});
					if (!found) {
						var task = new Task(t);
						task.save(function (err) {
							if (err) throw err;
						});
					}
				});
				cb();
			});
		}
		
		check_tasks(function () {
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
			if (!fsq || !fsq.value.access_token) return finished(); // "Couldn't find Foursquare settings. Have you set it up yet?"
			
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
		var new_item = false;
		var activity_item;// = new ActivityItem();
		
		ActivityItem.findOne({guid: self.platform+"-"+checkin.id}, function (err, item) {
			if (err) throw err;
			
			if (item) {
				// it exists, let's just update it
				activity_item = item;
			} else {
				// doesn't exist, create a blank one
				activity_item = new ActivityItem();
				new_item = true;
			}
			
			Identity.findOne({platform: self.platform, platform_id: checkin.user.id}, function (err, identity) {
				if (err || !identity) {
					identity = new Identity();
					identity.photo = [];
				}
				identity.platform = self.platform;
				identity.platform_id = checkin.user.id;
				identity.guid = identity.platform + "-" + identity.platform_id;
				identity.user_name = checkin.user.firstName + " " + checkin.user.lastName;
				identity.display_name = identity.user_name;
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
					if (checkin.photos.count > 0) {
						var image = {};
						image.type = "photo";
						image.sizes = [];
						checkin.photos.items.forEach (function (photo) {
							photo.sizes.items.forEach(function (size) {
								image.sizes.push({url: size.url, width: size.width, height: size.height});
							});
						});
						activity_item.media = [image];
					}
					activity_item.posted_at = new Date(Date.parse(checkin.createdAt));
					activity_item.data = checkin;
					
					var chars = [];
					
					if (new_item) {
						activity_item.message = message;
						activity_item.analyzed_at = new Date(0);
						activity_item.topics = [];
						activity_item.characteristics = [];
						activity_item.attributes = {};

						chars.push("Foursquare venue: "+checkin.venue.name);
						if (checkin.shout && checkin.shout.length > 0) {
							chars.push("Foursquare shout");
						} else {
							chars.push("Foursquare no shout");
						}
						checkin.venue.categories.forEach(function (category) {
							chars.push("Venue category: "+category.name);
						});
						
						activity_item.unshorten_urls(function (err) {
							add_characteristic();
						});
					} else {
						add_characteristic();
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
				}); // id.save
			});	// Identity.findOne		
		}); // ActivityItem.findOne
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
		secrets: {
			clientId: settings.client_id,
			clientSecret: settings.client_secret,
			redirectUrl: settings.callback_url
		},
		foursquare: {
			version: "20120527"
		}
	}
	return foursquare_api(config);
}
