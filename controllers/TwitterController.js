/**
 *  Twitter Controller
 **/

var sys = require('sys'),
	http = require('http'),
	mongoose = require('mongoose'),
	validator = require('validator'),
	libsaturn = require('../lib/saturn.js'),
	conf = require('node-config');
	
var	TwitterUser = mongoose.model('TwitterUser'),
	Task = mongoose.model('Task'),
	ActivityItem = mongoose.model('ActivityItem'),
	Characteristic = mongoose.model('Characteristic'),
	Identity = mongoose.model('Identity'),
	User = mongoose.model('User');

var ViewTemplatePath = 'services';


var util = require('util'),
	twitter_api = require('twitter');

module.exports = {
	
	stream: function (req, res, next, me) {
		
		var stream_timeout = 8*1000;
		var ping_frequency = 2*1000;
		
		Task.findOne({controller: "TwitterController", method: "stream"}, function (err, task) {
			if (err || !task) {
				return res.send("No task set up for monitoring a twitter stream..");
			}
			
			var attr = task.attributes || {};
			
			if (attr.connected && attr.last_ping.getTime() > Date.now() - stream_timeout) {
				return res.send("Already streaming...");
			}
			
			console.log("OPENING NEW STREAM");
			
			attr.connected = true;
			update_task();
			
			function update_task (cb) {
				if (attr.connected) {
					attr.last_ping = new Date();
					Task.update({controller: "TwitterController", method: "stream"}, {attributes: attr}, {}, function () {
						// err?
					});
					setTimeout(update_task, ping_frequency);
				}
			}
			
			User.findOne()
				.populate("twitter")
				.run(function (err, user) {
				if (err || !user) {
					//console.log("no user found");
					attr.connected = false;
					return update_task(function (err) {
						res.send("No user found");
					});
				}
				me = user;
				//console.log(me);
				twitter = get_twitter(me.twitter.access_token_key, me.twitter.access_token_secret);
				
				var streaming = false;
				twitter.stream('user', {}, function(stream) {
					streaming = true;
					attr.connected = true;
					stream.on('data', function(data) {
						//console.log("stream.data");
						if (data && data.friends && data.friends.length > 0) { return; }
						if (data && data.text && data.user && data.user.screen_name) {
							//console.log("new tweet from: @"+data.user.screen_name);
							process_tweet(data);
							return;
						}
				        //console.log(util.inspect(data));
				    });
					stream.on('error', function(error) {
						console.log("stream.error");
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
					stream.on('end', function() {
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
		
	},
	
	timeline: function (req, res, next, me) {
		//console.log("TwitterController.js::test()");
		if (!res) {
			res = {};
			res.send = function () { };
		}
		
		var me;
		var twitter;
		
		Task.findOne({controller: "TwitterController", method: "timeline"}, function (err, task) {
			if (err || !task) {
				return res.send("Couldn't find timeline task");
			}
			var attr = task.attributes || {};
			var since_id = attr.since_id || 0;
			User.findOne()
				.populate("twitter")
				.run(function (err, user) {
				if (err || !user) {
					//console.log("no user found");
					res.send("Done");
					return;
				}
				me = user;
				//console.log(me);
				twitter = get_twitter(me.twitter.access_token_key, me.twitter.access_token_secret);
				twitter.getHomeTimeline({since_id: since_id, count: 100, include_entities: true}, function (err, tweets) {
					
					if (!tweets || tweets.length == 0 || !tweets[0] || !tweets[0].hasOwnProperty("id_str")) {
						//console.log("No tweets..");
						res.send("Done");
						return;
					}
					
					since_id = tweets[0].id_str;
					
					process_next_tweet();
					
					function process_next_tweet () {
						if (tweets.length == 0) {
							return finished();
						}
						var tweet = tweets.pop();
						
						if (tweet.retweeted_status && tweet.retweeted_status.text) {
							tweet = tweet.retweeted_status;
							return process_next_tweet();
						}
						
						process_tweet(tweet, function (err) {
							process_next_tweet();
						});
						
					}
					
					function finished () {
						// Hmm...
						res.send("Done");
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
	},

	// oauth redirect
	oauth: function (req, res, next, me) {
		var self = this,
			url = require('url');
		var path = url.parse(req.url, true);
		twitter = get_twitter();
		
		twitter.login("/twitter/oauth", "/twitter/auth")(req, res, next);
		//res.writeHead(303, { "location": "https://twitter.com/oauth/authorize?oauth_token=" + conf.twitter.consumer_key });
		//res.end();
	},
	
	// receive & process oauth from Twitter
	auth: function (req, res, next, me) {
		var redirect_url = "/dashboard";
		var twitter_user;
		var profile = {};
		var user_name = "";
		var registered = false;
		var logged_in = false;
		
		/**/
		var access_token_key = req.query.access_token_key;
		var access_token_secret = req.query.access_token_secret;
		twitter = get_twitter(access_token_key, access_token_secret);
		twitter.verifyCredentials(function(data) {
			//console.log(util.inspect(data));
		}).showUser(req.query.screen_name, profile_retrieved);
		
		/**/
		
		function finish (err) {
			if (err) {
				return res.render("500", {error: err.message});
			}
			if (!registered && !logged_in) {
				return res.render("500", {error: "Something went wrong."});
			}
			
			return res.redirect(redirect_url);
		}
		
		function log_in () {
			res.setHeader('Set-Cookie', "session_key="+me.getSessionKey()+"; path=/");
			res.setHeader('Set-Cookie', "session_token="+me.generateToken()+"; path=/");
			logged_in = true;
			return finish();
		}
		
		function profile_retrieved (data) {
			console.log("profile_retrieved()");
			
			profile = data;
			
			if (me.isUser()) {
				return connect_twitter_to_user();
			} else {
				return find_user_by_twitter();
			}
		}
		
		function connect_twitter_to_user () {
			console.log("connect_twitter_to_user()");
			logged_in = true;
			me.save(function (err) {
				if (err) {
					return finish(new Error("There was an error saving the access_token_key ("+access_token_key+")"));
				}
				return finish();
			});
		}
		
		function find_user_by_twitter () {
			console.log("find_user_by_twitter()");
			TwitterUser.findOne({"access_token_key": access_token_key})
			.populate("user")
			.run(function (err, tw) {
				if (err) {
					return finish(err);
				}
				
				if (tw && tw.access_token_key == access_token_key) {
					twitter_user = tw;
					me = twitter_user.user;
					me.save();
					
					if (!twitter_user.tweets || twitter_user.tweets.length == 0) {
						//redirect_url = "/twitter/history";
					}
					return log_in();
				} else {
					return register_via_twitter();
				}
			});
		}
		
		function register_via_twitter () {
			console.log("register_via_twitter()");
			//redirect_url = "/twitter/history";
			var twitter_id_str = String(profile.id_str);
			user_name = profile.screen_name && String(profile.screen_name).length > 0 ? profile.screen_name : "No name?";
			console.log("user name: "+user_name);
			
			User.findOne({user_name: user_name}, function (err, existing) {
				if (!err && existing && existing.user_name == user_name) {
					user_name = user_name + String(Math.round(Math.random()*900+100));
				}
				
				twitter_user = new TwitterUser({
					access_token_key: access_token_key, 
					access_token_secret: access_token_secret, 
					profile: profile
				});
				twitter_user.save(function (err) {
					if (err) {
						return finish(err);
					}
					return attach_twitter_to_me();
				});
			});
		}
		
		function attach_twitter_to_me () {
			if (!user_name || user_name == "") {
				return finish(new Error("Something really bad happened."));
			}
			me = new User({
				user_name: user_name, 
				twitter: twitter_user.id
			});
			me.registerUser();
			me.setPassword("pwd"+Date.now());
			me.save(function (err) {
				if (err) {
					console.error("While saving user after twitter save: "+err);
					return finish(err);
				}
				twitter_user.user = me.id;
				twitter_user.save(function (err) {
					log_in();
				});
			});
		}
	}
	// end /twitter/auth
}

function process_tweet (tweet, cb) {
	//console.log("Processing tweet: "+tweet.text.substring(0, 50));
	if (tweet.text.substring(0, 4) == "RT @") {
		//console.log(tweet);
	}
	
	if (tweet.retweeted_status && tweet.retweeted_status.text) {
		tweet = tweet.retweeted_status;
		return false;
	}
	
	var identity;
	var activity_item = new ActivityItem();
	Identity.findOne({platform: "twitter", platform_id: tweet.user.id_str}, function (err, id) {
		if (err || !id) {
			id = new Identity();
			id.photo = [];
		}
		id.platform = "twitter";
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
			activity_item.platform = "twitter";
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
							cb();
						}
					});
				});
			}
		});
	});
	
}

function get_twitter_user (user_id, cb) {
	TwitterUser.findOne({user: user_id}, {access_token:1, access_token_secret:1}, function (err, twitter_user) {
		if (err) {
			return cb(err);
		}
		if (!twitter_user || !twitter_user.access_token) {
			return cb(new Error("Not linked with Twitter?"));
		}
		
		cb(err, twitter_user);
	});
}

function get_twitter (access_token_key, access_token_secret) {
	var twit = new twitter_api({
		consumer_key: conf.twitter.consumer_key,
		consumer_secret: conf.twitter.consumer_secret,
		access_token_key: access_token_key,
		access_token_secret: access_token_secret
	});
	return twit;
}
