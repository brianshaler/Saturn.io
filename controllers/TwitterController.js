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
	
	self.platform = "twitter";
	
	self.tasks = [
		{controller: "TwitterController", method: "timeline", interval: 60},
		{controller: "TwitterController", method: "stream", interval: 10, attributes: {connected: false}}
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
			self._get_settings(function (err, tw) {
				if (err) throw err;
			
				if (step == "connect") { // Step 2: /twitter/setup/connect
					var is_setup = false;
					if (tw && tw.value && tw.value.access_token_key && tw.value.access_token_secret) {
						is_setup = true;
					}
					// Show the page for this step
					return self.render('admin/setup/twitter/connect', {
						layout: "admin/admin-layout",
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
							self._next_step(app_settings, step);
						});
						return;
					} else {
						// Show the page for this step
						return self.render('admin/setup/twitter/app', {
							layout: "admin/admin-layout",
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
		
		var stream_timeout = 4.5*1000;
		var ping_frequency = 1*1000;
		
		
		Settings.findOne({option: self.platform}, function(err, tw) {
			if (err) throw err;
			if (!tw || !tw.value.access_token_key || !tw.value.access_token_secret) return res.send("Couldn't find Twitter settings. Have you set it up yet?");
			
			var access_token_key = tw.value.access_token_key;
			var access_token_secret = tw.value.access_token_secret;
		
			Task.findOne({controller: "TwitterController", method: "stream"}, function (err, task) {
				if (err || !task) {
					return res.send("No task set up for monitoring a twitter stream..");
				}
			
				var attr = task.attributes || {};
			
				if (attr.connected) {
					if (attr.last_ping.getTime() < Date.now() - stream_timeout) {
						attr.connected = false;
						update_task(function () {
							res.send("Already streaming, but timing out.");
						});
					} else {
						res.send("Already streaming... "+(Date.now()-attr.last_ping.getTime())/1000);
					}
					return;
				}
			
				console.log("OPENING NEW STREAM");
			
				attr.connected = true;
				update_task();
			
				function update_task (cb) {
					if (attr.connected) {
						attr.last_ping = new Date();
						setTimeout(update_task, ping_frequency);
					}
					Task.update({controller: "TwitterController", method: "stream"}, {attributes: attr}, {}, function () {
						// err?
					});
				}
			
				//console.log(me);
				twitter = get_twitter(tw.value, access_token_key, access_token_secret);
				
				var streaming = false;
				twitter.stream('user', {}, function(stream) {
					streaming = true;
					attr.connected = true;
					stream.on('data', function(data) {
						//console.log("stream.data");
						if (data && data.friends && data.friends.length > 0) { return; }
						if (data && data.text && data.user && data.user.screen_name) {
							//console.log("new tweet from: @"+data.user.screen_name);
							try {
								self._process_tweet(data, function () { });
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
						update_task(function (err) {
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
						update_task(function (err) {
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
						update_task(function (err) {
							console.log("Stream terminating");
							res.send("Done");
						});
					});
					// Disconnect stream after five seconds
					//setTimeout(function () { console.log("Okay, killing it"); stream.destroy(); }, 5000);
				});
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
						
						self._process_tweet(tweet, function (err) {
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
	
	self._process_tweet = function (tweet, cb) {
		//console.log("Processing tweet: "+tweet.text.substring(0, 50));
		if (tweet.text.substring(0, 4) == "RT @") {
			//console.log(tweet);
		}

		if (tweet.retweeted_status && tweet.retweeted_status.text) {
			tweet = tweet.retweeted_status;
			// skip retweet:
			cb();
			return false;
		}

		var identity;
		var activity_item = new ActivityItem();
		Identity.findOne({platform: self.platform, platform_id: tweet.user.id_str}, function (err, id) {
			if (err || !id) {
				id = new Identity();
				id.photo = [];
			}
			id.platform = self.platform;
			id.platform_id = tweet.user.id_str;
			id.user_name = tweet.user.screen_name;
			id.display_name = tweet.user.name + " (@"+ tweet.user.screen_name + ")";
			id.guid = id.platform + "-" + id.platform_id;
			var photo_found = false;
			id.photo.forEach(function (photo) {
				if (photo.url == tweet.user.profile_image_url_https) {
					photo_found = true;
				}
			});
			if (!photo_found) {
				id.photo.push({url: tweet.user.profile_image_url_https});
			}
			id.updated_at = new Date();
			id.save(function (err) {
				activity_item.platform = self.platform;
				activity_item.guid = activity_item.platform + "-" + tweet.id_str;
				activity_item.user = id.id;
				activity_item.message = tweet.text;
				activity_item.posted_at = new Date(Date.parse(tweet.created_at));
				activity_item.analyzed_at = new Date(0);
				activity_item.topics = [];
				activity_item.characteristics = [];
				activity_item.attributes = {};
				activity_item.data = tweet;

				activity_item.message = tweet.text;

				var chars = [];
				chars.push("source: "+tweet.source);
				if (tweet.text.indexOf("http") >= 0) {
					chars.push("has link");
					chars.push("link shared by by: "+id.user_name);
				}
				if (tweet.text.indexOf("RT @") >= 0) {
					chars.push("is retweet");
					chars.push("retweeted by: "+id.user_name);
				}
				if (tweet.text.match(/(^|\s)@[-A-Za-z0-9_]+(\s|$)/gi)) {
					chars.push("is mention");
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
								//console.log("Finished: "+tweet.text.substring(0, 50));
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





function get_twitter (settings, access_token_key, access_token_secret) {
	var twit = new twitter_api({
		consumer_key: settings.consumer_key,
		consumer_secret: settings.consumer_secret,
		access_token_key: access_token_key,
		access_token_secret: access_token_secret
	});
	return twit;
}
