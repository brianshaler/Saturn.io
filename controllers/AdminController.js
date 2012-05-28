/**
 *  Admin Controller
 **/

var mongoose = require('mongoose'),
	conf = require('node-config'),
	crypto = require('crypto');

// Models
var Settings = mongoose.model('Settings'),
	Task = mongoose.model('Task'),
	JunkTopic = mongoose.model('JunkTopic'),
	ActivityItem = mongoose.model('ActivityItem');

exports.controller = function(req, res, next) {
	Controller.call(this, req, res, next);
	var self = this;
	
	self.index = function() {
		if (!req.require_authentication("/admin")) { return; }
		
		return self.render('admin/index', {layout: "admin/admin-layout"});
	}
	
	self.setup = function() {
		var step;
		var session = req.session;
		
		self._get_settings("app", function (err, app_settings) {
			if (err) throw err;
			
			if (parseInt(req.params.id) > 0) {
				step = parseInt(req.params.id);
			} else
			if (req.params.id === "0" || req.params.id === 0) {
				step = 0;
			} else {
				if (app_settings.value && app_settings.value.setup_step) {
					step = app_settings.value.setup_step;
				} else {
					step = 0;
				}
			}
			
			if (step == 0) {
				check_tasks();
				
				function check_tasks () {
					//return check_junk_topics();
					Task.count({}, function (err, count) {
						if (err) throw err;
						
						if (count == 0) {
							var tasks = [
								{controller: "TwitterController", method: "timeline", interval: 60},
								{controller: "TwitterController", method: "stream", interval: 10, attributes: {connected: false}},
								{controller: "FoursquareController", method: "timeline", interval: 120},
								{controller: "AnalysisController", method: "analyze", interval: 8}
							];
							tasks.forEach(function (t) {
								var task = new Task(t);
								task.save(function (err) {
									if (err) throw err;
								});
							});
							check_junk_topics();
						} else {
							check_junk_topics();
						}
					});
				}
				
				function check_junk_topics () {
					JunkTopic.count({}, function (err, count) {
						if (err) throw err;
						
						if (count == 0) {
							fs.readFile('cache/junk_topics.json', 'utf8', add_missing_junk_topics);
						} else {
							begin_setup();
						}
					});
				}
				
				function add_missing_junk_topics (err, content) {
					var junk_topics = [];
					if (!err) {
						junk_topics = JSON.parse(content);
					}
					
					if (junk_topics.length > 0) {
						console.log("Adding "+junk_topics.length+" initial non-topics");
						JunkTopic.find({"text": {"$in":junk_topics}}, function (err, existing) {
							if (err) throw err;
				
							var new_junk_topics = [];
				
							junk_topics.forEach(function (t) {
								var found = false;
								existing.forEach(function (et) {
									if (!found && et.text.toLowerCase() == t.toLowerCase()) {
										found = true;
									}
								});
								if (!found) {
									var jt = new JunkTopic({text: t});
									jt.save(function (err) {
										if (err) throw err;
									});
								}
							});
							begin_setup();
						});
					} else {
						begin_setup();
					}
					
				}
				
				function begin_setup () {
					if (!app_settings.value || !app_settings.value.user_name) {
						if (req.body && req.body.settings && req.body.settings.user_name && req.body.settings.password) {
							var user_name = req.body.settings.user_name;
							var hashed_password = self._hash(req.body.settings.password);
							var session_key = self._generate_session_key(user_name, hashed_password);
							var session_token = self._generate_token(user_name, session_key);
						
							session.session_key = session_key;
							session.session_token = session_token;
							session.user_name = user_name;
						
							app_settings.value.user_name = user_name;
							app_settings.value.password = hashed_password;
							app_settings.value.session_key = session_key;
							self._next_step(app_settings, step);
						} else {
							return self.render('admin/setup/account', {
								locals: {
									title: 'SET USER NAME',
									settings: app_settings.value
								}
							});
						}
					} else {
						return res.redirect('/admin');
					}
				}
			} else {
				req.flash("Setup Complete!");
				res.redirect("/admin");
			}
		});
	}
	
	
	self.login = function () {
		var redirect_url = "";
		var session = req.session;
		if (req.body.user_name && req.body.password) {
			redirect_url = "/admin/login";
			self._get_settings("app", function (err, app_settings) {
				if (err) throw err;
				
				if (app_settings && app_settings.value.user_name) {
					var session_key = app_settings.value.session_key;
					var user_name = app_settings.value.user_name;
					var password = app_settings.value.password;
					
					if (req.body.user_name === user_name && self._hash(req.body.password) === password) {
						// Good to go!
						
						if (req.body.redirect_url && String(req.body.redirect_url).length > 0) {
							redirect_url = req.body.redirect_url;
						} else {
							redirect_url = "/";
						}
						
						if (!session_key || session_key == "") {
							session_key = self._generate_session_key(user_name, password);
						}
						
						var session_token = self._generate_token(user_name, session_key);
						
						session.session_key = session_key;
						session.session_token = session_token;
						session.user_name = user_name;
					} else {
						req.flash("Login failed");
					}
				}
				
				finish();
			});
		} else {
			finish();
		}
		
		function finish () {
			if (redirect_url == "") {
				if (req.query && String(req.query.redirect_url).length > 0) {
					redirect_url = req.query.redirect_url;
				}
				self.render('admin/login', {
					title: 'Login',
					user_name: req.body.user_name || "",
					redirect_url: redirect_url
				});
			} else {
				res.redirect(redirect_url);
			}
		}
	}
	
	self.logout = function () {
		var redirect_url = "/";
		var session = req.session;
		
		session.destroy();
		res.redirect("/");
	}
	
	
	// PRIVATE METHODS
	
	self._get_settings = function (option, cb) {
		Settings.findOne({option: option}, function(err, s) {
			if (err) return cb(err);
			
			if (!s) {
				s = new Settings({option: option, value: {}});
			}
			cb(null, s);
		});
	}
	
	self._next_step = function (app_settings, step) {
		step++;
		app_settings.value.setup_step = step;
		app_settings.commit('value');
		app_settings.save(function (err) {
			if (err) throw err;
			
			res.redirect('/admin/setup/'+step);
		});
	}
	
	self._generate_session_key = function (u, p) {
		var key = "";
		key = self._hash(u+p+Date.now());
		return key;
	}
	
	self._generate_token = function (u, k) {
		token = self._hash(u+"|"+k);
		return token;
	}
	
	self._hash = function (str) {
		var hashed;
		var h = crypto.createHash('sha1');
		h.update(str);
		hashed = h.digest('hex');
		return hashed;
	}
};