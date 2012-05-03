// Analysis Controller
//
// Core natural language processing controller

var sys = require('sys'),
	http = require('http'),
	mongoose = require('mongoose'),
	validator = require('validator'),
	libsaturn = require('../lib/saturn.js'),
	natural = require('natural'),
	conf = require('node-config');
	
var	TwitterUser = mongoose.model('TwitterUser'),
	ActivityItem = mongoose.model('ActivityItem'),
	Identity = mongoose.model('Identity'),
	Characteristic = mongoose.model('Characteristic'),
	Topic = mongoose.model('Topic'),
	User = mongoose.model('User');

var tokenizer = new natural.TreebankWordTokenizer();
natural.LancasterStemmer.attach();
var wordnet = new natural.WordNet('./cache');

var util = require('util'),
	twitter_api = require('twitter');

module.exports = {
	
	// run via cron, please
	analyze: function (req, res, next, me) {
		if (!res) {
			res = {};
			res.send = function () { };
		}
		
		ActivityItem.find({analyzed_at: {"$lt": (new Date(Date.now()-86300*1000))}, created_at: {"$gt": (new Date(Date.now()-86400*1000))}})
		.sort('posted_at', -1)
		.limit(30)
		.run(function (err, items) {
			if (err || !items) {
				console.log("No items found "+err);
				res.send("Done");
				return;
			}
			
			analyze_next();
			function analyze_next() {
				if (items.length == 0) {
					return finished();;
				}
				var item = items.shift();
				//console.log("Analyzing item: "+item.message);
				//item.ratings = ratings;
				//libsaturn.analyze(item);
				item.analyzed_at = new Date();
				item.save(function (err) {
					item.analyze(function (err, _item) {
						//console.log("Done analyzing "+_item.topics.length);
						//item.commit("ratings");
						_item.save(function (err) {
							// err?
						});
						analyze_next();
					});
				});
			}
			function finished () {
				res.send("Done");
			}
		});
	}
	// end /analysis/analyze
	
}

function analyze_item (_item, cb) {
	var error = null;
	var item = _item;
	
	var ratings = item.ratings || {};
	var characteristics = item.characteristics || [];
	var topics = item.topics || [];
	if (!ratings.overall) {
		ratings.overall = 0;
	}
	var message = item.message.toLowerCase();
	
	var url_pattern = /\(?\bhttps?:\/\/[-A-Za-z0-9+&@#\/%?=~_()|!:,.;]*[-A-Za-z0-9+&@#\/%=~_()|]/gi;
	var urls = message.match(url_pattern);
	var hash_pattern = /#[a-zA-Z_]*/gi;
	var hashtags = message.match(hash_pattern);
	
	urls = urls || [];
	hashtags = hashtags || [];
	
	var keywords = [];
	urls.forEach(function (url) {
		domain = url.substr(url.indexOf("//")+2);
		domain = domain.substr(0, domain.indexOf("/"));
		var found = false;
		keywords.forEach(function (existing) {
			if (existing == domain) {
				found = true;
			}
		});
		if (!found) {
			keywords.push(domain);
		}
	});
	hashtags.forEach(function (tag) {
		tag = tag.substring(1);
		var found = false;
		keywords.forEach(function (existing) {
			if (existing == tag) {
				found = true;
			}
		});
		if (!found) {
			keywords.push(tag);
		}
	});
	
	message = message.remove_urls().remove_hashtags().remove_screen_names().replace_punctuation();
	var words = tokenizer.tokenize(message);//.tokenizeAndStem();
	
	
	//console.log(words);
	
	function lookup_next_word () {
		if (words.length == 0) {
			return add_topics();
		}
		word = words.shift();
		//console.log("> Word: "+word);
		
		var neither = 0;
		var noun = 0;
		var verb = 0;
		
		if (word.length > 2) {
			if (word.substring(0, word.length-3) == "ing") {
				verb = 100;
				classify_word(word, noun, verb, neither);
			} else 
			if (word.match(/^[0-9]*$/)) {
				classify_word(word, noun, verb, neither);
			} else {
				wordnet.lookup(word, function(results) {
				
					results.forEach(function(result) {
						if (result.pos == "n") {
							noun++;
						} else 
						if (result.pos == "v") {
							verb++;
						} else
						if (result.pos == "a" || result.pos == "r" || result.pos == "s") {
							neither++;
						}
					});
					classify_word(word, noun, verb, neither);
				});
				return;
			}
		} else {
			classify_word(word, noun, verb, neither);
		}
	}
	function classify_word (w, n, v, neither) {
		if ((n == 0 && v == 0) || neither > n+v/2) {
			console.log("I don't know what kind of word '"+w+"' is");
		} else {
			console.log("Looked up '"+w+"' and found it is a ... "+(n >= v ? "noun ("+n+":"+v+")" : "verb ("+v+":"+n+")"));
			var found = false;
			keywords.forEach(function (existing) {
				if (existing == w) {
					found = true;
				}
			});
			if (!found) {
				keywords.push(w);
			}
		}
		lookup_next_word();
	}
	lookup_next_word();
	
	function add_topics () {
		var existing_topics = [];
		console.log("Getting topics");
		
		if (keywords.length > 0) {
			Topic.find({text: {"$in": keywords}}, function (err, t) {
				existing_topics = t;
				add_new_topics();
			});
		} else {
			done_with_topics();
		}
		
		function add_new_topics () {
			var new_topics = [];
			keywords.forEach(function (keyword) {
				var found = false;
				existing_topics.forEach(function (existing) {
					if (existing.text == keyword) {
						found = true;
					}
				});
				if (!found) {
					new_topics.push(keyword);
				}
			});
			
			function add_each_topic () {
				if (new_topics.length == 0) {
					return done_adding();
				}
				topic_text = new_topics.shift();
				var topic = new Topic({text: topic_text, ratings: {overall: 0}});
				topic.save(function (err) {
					add_each_topic();
				});
			}
			add_each_topic();
		}
		
		function done_adding () {
			var topic_ids = [];
			Topic.find({text: {"$in": keywords}}, function (err, t) {
				t.forEach(function (topic) {
					topic_ids.push(topic._id);
				});
				item.topics = topic_ids;
				console.log("ADDED TOPIC IDS! "+item.topics.length);
				item.commit("topics");
				
				done_with_topics();
			});
			
		}
		
		function done_with_topics () {
			console.log("calling back... "+item.topics.length);
			
			rate_that_shit();
		}
		
		function rate_that_shit () {
			var topic_ratings = 0;
			var topic_count = 0;
			var char_ratings = 0;
			var char_count = 0;
			
			ActivityItem.findOne({_id: item.id})
			.populate("characteristics")
			.populate("topics")
			.run(function (err, _item) {
				_item.topics.forEach(function (topic) {
					if (topic.ratings.overall > 0 || topic.ratings.overall < 0) {
						topic_ratings += topic.ratings.overall;
						topic_count++;
					}
				});
				_item.characteristics.forEach(function (ch) {
					char_ratings += parseInt(ch.rating);
					char_count++;
				});
				
				topic_count = topic_count > 1 ? topic_count : 1;
				char_count = char_count > 1 ? char_count : 1;
				
				ratings.topics = topic_ratings;
				ratings.characteristics = char_ratings;
				ratings.overall = 0 + (topic_ratings/topic_count + char_ratings/char_count*2)/3;
			});
			//rate_by_topics();
			//rate_by_characteristics();
			//rate_by_behavior();
			
			//Topic.find({_id: {"$in": item.topics}}, function (
			
			item.ratings = ratings;
			item.commit("ratings");
			cb(error, item);
		}
	}
}

function get_topics (text, cb) {
	var error = null;
	var my_topics = [];
	
	
	
	cb(error, my_topics);
}

if (!String.prototype.remove_urls) {
	String.prototype.remove_urls = function () {
		var url_pattern = /\(?\bhttps?:\/\/[-A-Za-z0-9+&@#\/%?=~_()|!:,.;]*[-A-Za-z0-9+&@#\/%=~_()|]/gi;
		return this.replace(url_pattern, "");
	}
}
if (!String.prototype.remove_hashtags) {
	String.prototype.remove_hashtags = function () {
		var hash_pattern = /(^|\s)#[-A-Za-z0-9_]+(\s|$)/gi;
		return this.replace(hash_pattern, "$1$2");
	}
}
if (!String.prototype.remove_screen_names) {
	String.prototype.remove_screen_names = function () {
		var at_pattern = /(^|\s)@[-A-Za-z0-9_]+(\s|$)/gi;
		return this.replace(at_pattern, "$1$2");
	}
}
if (!String.prototype.replace_punctuation) {
	String.prototype.replace_punctuation = function () {
		var alpha_pattern = /[^a-z^A-Z^0-9^-^_]/gi;
		return this.replace(alpha_pattern, " ");
	}
}

