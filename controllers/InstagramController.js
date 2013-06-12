/**
 *  Instagram Controller
 **/

var mongoose = require('mongoose'),
  instagram_api = require("instagram-node-lib"),
  url = require('url'),
  conf = require('node-config');

var Settings = mongoose.model('Settings'),
  Task = mongoose.model('Task'),
  ActivityItem = mongoose.model('ActivityItem'),
  Identity = mongoose.model('Identity'),
  Characteristic = mongoose.model('Characteristic');

exports.controller = function(req, res, next) {
  Controller.call(this, req, res);
  var self = this;

  self.nav_items = [{group: "admin", url: "/instagram/setup", text: "Instagram"}];

  self.layout = "dashboard";

  self.tasks = [
    {controller: "InstagramController", method: "feed", interval: 120}
  ];

  self.platform = "instagram";

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
      if (self.tasks.length === 0) {
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
      self._get_settings(function (err, ig) {
        if (err) throw err;

        if (step == "connect") { // Step 2: /instagram/setup/connect
          var is_setup = false;
          if (ig && ig.value && ig.value.access_token) {
            is_setup = true;
          }
          // Show the page for this step
          return self.render('admin/setup/instagram/connect', {
            layout: self.layout,
            locals: {
              title: 'Connect to Instagram',
              settings: {},
              is_setup: is_setup,
              current_step: step
            }
          });
        } else { // Default is Step 1: /instagram/setup/app
          if (req.body && req.body.settings && req.body.settings.instagram) {
            // Process form
            if (!ig.value) {
              ig.value = {};
            }
            for (var k in req.body.settings.instagram) {
              ig.value[k] = req.body.settings.instagram[k];
            }
            ig.commit('value');
            ig.save(function (err) {
              if (err) throw err;

              // Done with this step. Continue!
              res.redirect("/instagram/setup/connect");
            });
            return;
          } else {
            // Show the page for this step
            return self.render('admin/setup/instagram/app', {
              layout: self.layout,
              locals: {
                title: 'Instagram',
                settings: ig.value
              }
            });
          }
        }
      });
    });
  };


  // INSTAGRAM AUTHENTICATION

  // oauth redirect
  self.oauth = function () {
    if (!req.require_authentication()) { return; }

    Settings.findOne({option: self.platform}, function(err, ig) {
      if (err) throw err;
      if (!ig) ig = new Settings({option: self.platform});

      instagram = get_instagram(ig.value);
      res.writeHead(303, { "location": instagram.oauth.authorization_url({scope: 'comments likes'}) });
      res.end();
    });
  };

  // oauth callback
  self.auth = function() {
    if (!req.require_authentication()) { return; }

    var ig;
    var instagram;

    Settings.findOne({option: self.platform}, function(err, ig) {
      if (err) throw err;
      if (!ig) ig = new Settings({option: self.platform});

      instagram = get_instagram(ig.value);


      token_params = {
        complete: receive_token,
      error: receive_token_error,
      method: "POST",
      path: "/oauth/access_token",
      post_data: {
        client_id: ig.value.client_id,
      client_secret: ig.value.client_secret,
      grant_type: 'authorization_code',
      redirect_uri: ig.value.callback_url,
      code: req.query.code
      }
      };
      instagram._request(token_params);

      function receive_token (data) {
        ig.value.access_token = data.access_token;
        //console.log("Saving Instagram access_token: "+ig.value.access_token);
        ig.commit('value');
        ig.save(function(err) {
          if (err) {
            return res.send("Instagram wasn't connected.. Error while saving to the database");
          }
          self.feed(true);
          return res.redirect("/instagram/setup/connect");
        });
      }

      function receive_token_error (errorMessage, errorObject, caller, response) {
        console.log(errorMessage);
        console.log(errorObject);
        console.log(caller);
        console.log(response);
        res.send("An error occurred...");
      }
    });
  };


  self.feed = function (silent) {
    //console.log("InstagramController.js::feed()");
    var ig;

    Settings.findOne({option: self.platform}, function(err, ig) {
      if (err) return finished(err);
      if (!ig || !ig.value.access_token) return finished(); // "Couldn't find Instagram settings. Have you set it up yet?"

      var access_token = ig.value.access_token;

      Task.findOne({controller: "InstagramController", method: "feed"}, function (err, task) {
        if (err || !task) {
          return finished("Couldn't find feed task");
        }
        var attr = task.attributes || {};
        var since_id = attr.since_id || 0;
        var params = {limit: 100};
        if (attr.since_id) {
          params.min_id = attr.since_id;
        }

        params.complete = process_feed;
        params.error = function (errorMessage, errorObject, caller) {
          console.log("Error!");
          console.log(errorMessage);
          console.log(errorObject);
          console.log(caller);
        };
        params.access_token = ig.value.access_token;

        instagram = get_instagram(ig.value);
        // Another instance of payload being same parameter as err.... shit.


        instagram.users.self(params);

        function process_feed (posts) {

          if (!posts || posts.length === 0 || !posts[0]) {
            return finished();
          }

          since_id = posts[0].id;

          process_next_post();

          function process_next_post () {
            if (posts.length === 0) {
              return finished();
            }
            var post = posts.pop();

            self._process_post(post, function (err) {
              process_next_post();
            });

          }

          attr.since_id = since_id;
          task.attributes = attr;
          task.commit("attributes");
          task.save(function (err) {
            // ERROR?
          });
        }
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
  };

  self._process_post = function (post, cb) {
    //console.log("Processing post: ");
    //console.log(post);
    var message = "";
    if (post.caption && post.caption.text && post.caption.text.length > 0) {
      message = post.caption.text;
    } else {
      message = "Posted a photo " + post.link;
    }

    var identity;
    var new_item = false;
    var activity_item;// = new ActivityItem();

    ActivityItem.findOne({guid: self.platform+"-"+post.id}, function (err, item) {
      if (err) throw err;

      if (item) {
        // it exists, let's just update it
        activity_item = item;
      } else {
        // doesn't exist, create a blank one
        activity_item = new ActivityItem();
        new_item = true;
      }

      Identity.findOne({platform: self.platform, platform_id: post.user.id}, function (err, identity) {
        if (err || !identity) {
          identity = new Identity();
          identity.photo = [];
        }
        identity.platform = self.platform;
        identity.platform_id = post.user.id;
        identity.guid = identity.platform + "-" + identity.platform_id;
        identity.user_name = post.user.username;
        identity.display_name = post.user.full_name + " (" + post.user.username + ")";
        if (!identity.attributes) {
          identity.attributes = {};
        }
        identity.attributes.is_friend = true;
        var photo_found = false;
        identity.photo.forEach(function (photo) {
          if (photo.url == post.user.profile_picture) {
            photo_found = true;
          }
        });
        if (!photo_found) {
          identity.photo.push({url: post.user.profile_picture});
        }
        identity.updated_at = new Date();
        identity.save(function (err) {
          activity_item.platform = self.platform;
          activity_item.guid = activity_item.platform + "-" + post.id;
          activity_item.user = identity.id;
          var image = {};
          var keys = ["standard_resolution", "thumbnail", "low_resolution"];
          image.type = "photo";
          image.sizes = [];
          keys.forEach (function (size) {
            image.sizes.push({url: post.images[size].url, width: post.images[size].width, height: post.images[size].height});
          });
          activity_item.media = [image];
          activity_item.posted_at = new Date(parseInt(post.created_time, 10)*1000);
          activity_item.data = post;

          var chars = [];

          if (new_item) {
            activity_item.message = message;
            activity_item.analyzed_at = new Date(0);
            activity_item.topics = [];
            activity_item.characteristics = [];
            activity_item.attributes = {};
            activity_item.attributes.is_friend = true;

            activity_item.unshorten_urls(function (err) {
              add_characteristic();
            });
          } else {
            add_characteristic();
          }

          function add_characteristic () {
            if (chars.length === 0) {
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
                  //console.log("Finished: "+post.text.substring(0, 50));
                  cb();
                }
              });
            });
          }
        }); // identity.save
      }); // Identity.findOne   
    }); // ActivityItem.findOne
  };

  self._get_settings = function (cb) {
    Settings.findOne({option: self.platform}, function(err, s) {
      if (err) return cb(err);

      if (!s) {
        s = new Settings({option: self.platform, value: {}});
      }
      cb(null, s);
    });
  };

};

function get_instagram (settings) {
  instagram_api.set('client_id', settings.client_id);
  instagram_api.set('client_secret', settings.client_secret);
  instagram_api.set('redirect_uri', settings.callback_url);
  return instagram_api;
}
