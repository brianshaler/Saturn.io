/**
 *  Twitter Controller
 **/

var mongoose = require('mongoose'),
	twitter_api = require('twitter'),
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
	
	self.nav_items = [{group: "admin", url: "/twitter/setup", text: "Twitter"}];
	
	self.layout = "dashboard";
	
	self.tasks = [
		{controller: "TwitterController", method: "timeline", interval: 60},
		{controller: "TwitterController", method: "stream", interval: 10, attributes: {connected: false}},
		{controller: "TwitterController", method: "my_favorites", interval: 86400},
		//{controller: "TwitterController", method: "friends_favorites", interval: 120}
	];
	
	self.platform = "twitter";
	
	self.setup = function () {
		if (!req.require_authentication()) { return; }
		req.nav_group = "admin";
		
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
			self._get_settings(function (err, tw) {
				if (err) throw err;
			
				if (step == "connect") { // Step 2: /twitter/setup/connect
					var is_setup = false;
					if (tw && tw.value && tw.value.access_token_key && tw.value.access_token_secret) {
						is_setup = true;
					}
					// Show the page for this step
					return self.render('admin/setup/twitter/connect', {
						layout: self.layout,
						locals: {
							title: 'Connect to Twitter',
							settings: {},
							is_setup: is_setup,
							current_step: step
						}
					});
				} else { // Default is Step 1: /twitter/setup/app
					if (req.body && req.body.settings && req.body.settings.twitter) {
						// Process form
						if (!tw.value) {
							tw.value = {};
						}
						for (var k in req.body.settings.twitter) {
							tw.value[k] = req.body.settings.twitter[k];
						}
						tw.commit('value');
						tw.save(function (err) {
							if (err) throw err;
						
							// Done with this step. Continue!
							res.redirect("/twitter/setup/connect");
						});
						return;
					} else {
						// Show the page for this step
						return self.render('admin/setup/twitter/app', {
							layout: self.layout,
							locals: {
								title: 'Express TEST',
								settings: tw.value
							}
						});
					}
				}
			});
		});
	}
	
	
	// TWITTER AUTHENTICATION
	
	// oauth redirect
	self.oauth = function () {
		if (!req.require_authentication()) { return; }
		
		var path = url.parse(req.url, true);
		
		Settings.findOne({option: self.platform}, function(err, tw) {
			if (err) throw err;
			if (!tw) tw = new Settings({option: self.platform});
			
			twitter = get_twitter(tw.value);
			twitter.login("/twitter/oauth", "/twitter/auth")(req, res, next);
		});
	}
	
	// oauth callback
	self.auth = function() {
		if (!req.require_authentication()) { return; }
		
		var tw;
		
		// THIS IS ANNOYING!
		// When the user authenticates, the Twitter module redirects /twitter/auth?[keys_here] to /twitter/auth with the keys in a cookie
		// The cookie doesn't play nice with Express's cookieParser, so you have to extract the cookie via the internal cookie() method
		var tmp_twitter = get_twitter({consumer_key:"", consumer_secret:""});
		var twitter_credentials = tmp_twitter.cookie(req);
		
		var access_token_key = twitter_credentials.access_token_key;
		var access_token_secret = twitter_credentials.access_token_secret;
		var twitter_name = twitter_credentials.screen_name;
		
		// Save keys to the 'twitter' option in the Settings collection
		Settings.findOne({option: self.platform}, function(err, _tw) {
			tw = _tw
			if (err) throw err;
			if (!tw) tw = new Settings({option: self.platform});
			
			twitter = get_twitter(tw.value, access_token_key, access_token_secret);
			twitter.verifyCredentials(function(err, data) {
				//console.log(util.inspect(data));
			}).showUser(twitter_name, profile_retrieved);
		});
		
		// Just (data)? Payload seems to be returned in first parameter instead of second as in (err, data)
		// Looks to be caused by this:
		// In ./node_modules/twitter/lib/twitter.js:104
		// callback(json);
		function profile_retrieved (data) {
			
			if (data) {
				
				tw.value.access_token_key = access_token_key;
				tw.value.access_token_secret = access_token_secret;
				tw.commit('value');
				tw.save(function(err) {
					if (err) {
						return res.send("Twitter wasn't connected.. Error while saving to the database");
					}
					self.timeline(true);
					return res.send("Twitter successfully connected. <a href=\"/admin/setup\">Continue setup?</a>");
				});
			} else {
				return res.send("Failed to retrieve Twitter details.");
			}
			//res.send(data);
		}
	}
	
	
	// GETTING TWEETS
	
	self.stream = function () {
		
		var SECONDS = 1000;
		var MINUTES = 60*SECONDS;
		var stream_timeout = 4.5*SECONDS;
		var ping_frequency = 2*SECONDS;
		var activity_timeout = 5*MINUTES;
		
		Settings.findOne({option: self.platform}, function(err, tw) {
			if (err) throw err;
			if (!tw || !tw.value.access_token_key || !tw.value.access_token_secret) return res.send("Couldn't find Twitter settings. Have you set it up yet?");
			
			var access_token_key = tw.value.access_token_key;
			var access_token_secret = tw.value.access_token_secret;
			var stream;
			
			Task.findOne({controller: "TwitterController", method: "stream"}, function (err, task) {
				if (err || !task) {
					return res.send("No task set up for monitoring a twitter stream..");
				}
				
				var attr = task.attributes || {};
				
				if (attr.connected) {
					if (attr.last_ping.getTime() < Date.now() - stream_timeout) {
						attr.connected = false;
						ping_stream(function () {
							res.send("Already streaming, but timing out.");
						});
					} else {
						res.send("Already streaming... "+(Date.now()-attr.last_ping.getTime())/1000);
					}
					return;
				}
				
				function is_user_active (cb) {
					Settings.findOne({option: "app"}, function (err, app_settings) {
						if (!app_settings.value.last_activity) {
							app_settings.value.last_activity = new Date(Date.now()-activity_timeout);
							app_settings.save(function (err) { });
						}
						if (app_settings.value.last_activity > Date.now() - activity_timeout) {
							cb();
						} else {
							cb("Don't stream while user is not active");
						}
					});
				}
				
				is_user_active(function (err) {
					if (err) return res.send(err);
					open_stream();
				});
				
				function ping_stream (cb) {
					if (attr.connected) {
						attr.last_ping = new Date();
						setTimeout(ping_stream, ping_frequency);
					}
					Task.update({controller: "TwitterController", method: "stream"}, {attributes: attr}, {}, function () {
						// err?
					});
					is_user_active(function (err) {
						if (err && stream) {
							stream.destroy();
						}
					});
				}
				
				function open_stream () {
					console.log("OPENING NEW STREAM");
					
					attr.connected = true;
					ping_stream();
					
					//console.log(me);
					twitter = get_twitter(tw.value, access_token_key, access_token_secret);
					
					var streaming = false;
					twitter.stream('user', {replies: "all"}, function(_stream) {
						stream = _stream;
						streaming = true;
						attr.connected = true;
						stream.on('data', function(data) {
							//console.log("stream.data");
							if (data && data.friends && data.friends.length > 0) { return; }
							if (data && data.text && data.user && data.user.screen_name) {
								//console.log("new tweet from: @"+data.user.screen_name);
								try {
									self._process_tweet(twitter, data, function () { });
								} catch (e)
								{
									throw e;
								}
								return;
							}
					        //console.log(util.inspect(data));
					    });
						stream.on('error', function(error) {
							console.log("stream.error");
							console.log(error);
							console.log(error.stack);
							attr.connected = false;
							streaming = false;
							try {
								stream.destroy();
							} catch (e) {
						
							}
							ping_stream(function (err) {
								res.send(error);
							});
						});
						stream.on('end', function(err) {
							console.log("stream.end");
							attr.connected = false;
							streaming = false;
							try {
								stream.destroy();
							} catch (e) {
						
							}
							ping_stream(function (err) {
								console.log("Stream terminating");
								res.send("Done");
							});
						});
						stream.on('close', function() {
							console.log("stream.close");
							attr.connected = false;
							streaming = false;
							try {
								stream.destroy();
							} catch (e) {
						
							}
							ping_stream(function (err) {
								console.log("Stream terminating");
								res.send("Done");
							});
						});
						// Disconnect stream after five seconds
						//setTimeout(function () { console.log("Okay, killing it"); stream.destroy(); }, 5000);
					});
				}
			});
		});
	}
	
	self.timeline = function (silent) {
		//console.log("TwitterController.js::timeline()");
		var twitter;
		
		Settings.findOne({option: self.platform}, function(err, tw) {
			if (err) return finished(err);
			if (!tw) return finished(); // "Couldn't find Twitter settings. Have you set it up yet?"
			
			var access_token_key = tw.value.access_token_key;
			var access_token_secret = tw.value.access_token_secret;
			
			Task.findOne({controller: "TwitterController", method: "timeline"}, function (err, task) {
				if (err || !task) {
					return finished("Couldn't find timeline task");
				}
				var attr = task.attributes || {};
				var since_id = attr.since_id || -1;
				var params = {count: 100, include_entities: true};
				if (attr.since_id) {
					params.since_id = attr.since_id;
				}
				
				twitter = get_twitter(tw.value, access_token_key, access_token_secret);
				// Another instance of payload being same parameter as err.... shit.
				twitter.getHomeTimeline(params, function (tweets, dummy) {
					
					if (!tweets || tweets.length == 0 || !tweets[0] || !tweets[0].hasOwnProperty("id_str")) {
						//console.log("No tweets..");
						return finished();
					}
					
					since_id = tweets[0].id_str;
					
					process_next_tweet();
					
					function process_next_tweet () {
						if (tweets.length == 0) {
							return finished();
						}
						var tweet = tweets.pop();
						
						if (tweet.retweeted_status && tweet.retweeted_status.text) {
							//tweet = tweet.retweeted_status;
							//return process_next_tweet();
						}
						
						self._process_tweet(twitter, tweet, function (err) {
							process_next_tweet();
						});
						
					}
					
					attr.since_id = since_id;
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
	
	self.my_favorites = function (silent) {
		var twitter;
		
		Settings.findOne({option: self.platform}, function(err, tw) {
			if (err) return finished(err);
			if (!tw) return finished(); // "Couldn't find Twitter settings. Have you set it up yet?"
			
			var access_token_key = tw.value.access_token_key;
			var access_token_secret = tw.value.access_token_secret;
			
			Task.findOne({controller: "TwitterController", method: "my_favorites"}, function (err, task) {
				if (err || !task) {
					return finished("Couldn't find my_favorites task");
				}
				var attr = task.attributes || {};
				var since_id = attr.since_id || -1;
				var params = {count: 100, include_entities: true};
				if (attr.since_id) {
					params.since_id = attr.since_id;
				}
				
				twitter = get_twitter(tw.value, access_token_key, access_token_secret);
				// Another instance of payload being same parameter as err.... shit.
				twitter.getFavorites(params, function (tweets, dummy) {
					
					if (!tweets || tweets.length == 0 || !tweets[0] || !tweets[0].hasOwnProperty("id_str")) {
						//console.log("No tweets..");
						return finished();
					}
					
					since_id = tweets[0].id_str;
					
					process_next_tweet();
					
					function process_next_tweet () {
						if (tweets.length == 0) {
							return finished();
						}
						var tweet = tweets.pop();
						
						if (tweet.retweeted_status && tweet.retweeted_status.text) {
							//tweet = tweet.retweeted_status;
							//return process_next_tweet();
						}
						
						self._process_tweet(twitter, tweet, function (err, activity_item) {
							if (activity_item) {
								activity_item.like(function (err) {
									process_next_tweet();
								});
							} else {
								process_next_tweet();
							}
						});
					}
					
					attr.since_id = since_id;
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
	
	self._get_tweet = function (twitter, tweet_id, cb) {
		var guid = self.platform + "-" + tweet_id;
		
		ActivityItem.findOne({guid: guid}, function (err, item) {
			if (err) return cb(err);
			
			if (item && item.guid == guid) {
				cb(null, item);
			} else {
				twitter = get_twitter({consumer_key: twitter.options.consumer_key, consumer_secret: twitter.options.consumer_secret}, twitter.options.access_token_key, twitter.options.access_token_secret);
				twitter.showStatus(tweet_id, function (tweet, dummy) {
					if (tweet && tweet.id_str) {
						self._process_tweet(twitter, tweet, function (err, activity_item) {
							if (err) return cb(err);
							
							cb(null, activity_item);
						});
					} else {
						cb("Couldn't fetch tweet..");
					}
				});
			}
		});
	}
	
	self._process_tweet = function (twitter, tweet, cb) {
		//console.log("Processing tweet: "+tweet.text.substring(0, 50));
		if (tweet.text.substring(0, 4) == "RT @") {
			//console.log(tweet);
		}
		
		var identity;
		var new_item = false;
		var activity_item;// = new ActivityItem();
		
		Identity.findOne({platform: self.platform, platform_id: tweet.user.id_str}, function (err, identity) {
			if (err || !identity) {
				identity = new Identity();
				identity.photo = [];
			}
			identity.platform = self.platform;
			identity.platform_id = tweet.user.id_str;
			identity.guid = identity.platform + "-" + identity.platform_id;
			identity.user_name = tweet.user.screen_name;
			identity.display_name = tweet.user.name + " (@"+ tweet.user.screen_name + ")";
			if (!identity.attributes) {
				identity.attributes = {};
			}
			identity.attributes.twitter_favorites_count = tweet.user.favourites_count;
			if (!identity.attributes.twitter_favorites_cached) {
				identity.attributes.twitter_favorites_cached = 0;
			}
			if (tweet.user.following == true) {
				identity.attributes.is_friend = true;
			} else
			if (!identity.attributes.is_friend && tweet.user.following === false) {
				identity.attributes.is_friend = false;
			}
			identity.commit("attributes");
			var photo_found = false;
			identity.photo.forEach(function (photo) {
				if (photo.url == tweet.user.profile_image_url_https) {
					photo_found = true;
				}
			});
			if (!photo_found) {
				identity.photo.push({url: tweet.user.profile_image_url_https});
			}
			identity.updated_at = new Date();
			identity.save(function (err) {
				
				if (tweet.retweeted_status && tweet.retweeted_status.text) {
					//tweet = tweet.retweeted_status;
					// skip retweet:
					self._process_tweet(twitter, tweet.retweeted_status, function (err, retweeted) {
						if (err || !retweeted) return cb(err, retweeted);

						var found = false;
						if (!retweeted.activity) { retweeted.activity = []; }
						retweeted.activity.forEach(function (act) {
							if (act.identity == identity._id && act.action == "retweet") {
								found = true;
							}
						});
						if (found) {
							analyze_item();
						} else {
							retweeted.activity.push({
								_id: false, 
								action: "retweet", 
								identity: identity._id,
								message: "Retweeted",
								created_at: new Date(Date.parse(tweet.created_at))
							});
							retweeted.commit("activity");
							retweeted.save(function (err) {
								if (err) console.log(err);
								cb(err, retweeted);
							});
						}
						cb(err, activity_item);
					});
					return false;
				}
				
				ActivityItem.findOne({guid: self.platform+"-"+tweet.id_str}, function (err, item) {
					if (err) throw err;
			
					if (item) {
						// it exists, let's just update it
						activity_item = item;
					} else {
						// doesn't exist, create a blank one
						activity_item = new ActivityItem();
						new_item = true;
					}
					
					activity_item.platform = self.platform;
					activity_item.guid = activity_item.platform + "-" + tweet.id_str;
					activity_item.user = identity.id;
					activity_item.posted_at = new Date(Date.parse(tweet.created_at));
					activity_item.data = tweet;
					if (!activity_item.attributes) {
						activity_item.attributes = {};
					}
					activity_item.attributes.is_friend = identity.attributes.is_friend
					activity_item.commit("attributes");
					
					var chars = [];
					
					if (new_item) {
						activity_item.message = tweet.text;
						activity_item.analyzed_at = new Date(0);
						activity_item.topics = [];
						activity_item.characteristics = [];
						
						chars.push("source: "+tweet.source);
						if (tweet.text.indexOf("http") >= 0) {
							chars.push("has link");
							chars.push("link shared by by: "+identity.user_name);
						}
						if (tweet.text.indexOf("RT @") >= 0) {
							chars.push("is retweet");
							chars.push("retweeted by: "+identity.user_name);
						}
						if (tweet.text.match(/(^|\s)@[-A-Za-z0-9_]+(\s|$)/gi)) {
							chars.push("is mention");
						}
						
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
							
							// check for @reply before continuing
							if (activity_item.data.in_reply_to_status_id_str && activity_item.data.in_reply_to_status_id_str.length > 0) {
								self._get_tweet(twitter, activity_item.data.in_reply_to_status_id_str, function (err, replied_activity_item) {
									
									if (!err && replied_activity_item) {
										var found = false;
										if (!replied_activity_item.activity) { replied_activity_item.activity = []; }
										replied_activity_item.activity.forEach(function (act) {
											if (act._id == activity_item._id) {
												found = true;
											}
										});
										if (found) {
											analyze_item();
										} else {
											replied_activity_item.activity.push({
												_id: activity_item._id, 
												action: "reply", 
												identity: identity._id,
												message: activity_item.message,
												created_at: activity_item.posted_at
											});
											replied_activity_item.commit("activity");
											replied_activity_item.save(function (err) {
												if (err) console.log(err);
												analyze_item();
											});
										}
									} else {
										console.log("Fail. "+activity_item._id);
										console.log(err);
										analyze_item();
									}
								});
							} else {
								analyze_item();
							}
							
							function analyze_item () {
								activity_item.analyze(function (err, _item) {
									if (!err && _item) {
										_item.save(function (err) {
											//console.log("ActivytItem saved / "+err);
											// ERROR?
										});
									}
									if (cb) {
										//console.log("Finished: "+tweet.text.substring(0, 50));
										cb(null, _item);
									}
								});
							}
						});
					}
				}); // identity.save
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





function get_twitter (settings, access_token_key, access_token_secret) {
	var twit = new twitter_api({
		consumer_key: settings.consumer_key,
		consumer_secret: settings.consumer_secret,
		access_token_key: access_token_key,
		access_token_secret: access_token_secret
	});
	return twit;
}
