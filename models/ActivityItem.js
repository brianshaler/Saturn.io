/**
 *  ActivityItem schema
 **/

var mongoose = require('mongoose'),
	unshortener = require('unshortener'),
	natural = require('natural'),
	Schema = mongoose.Schema,
	ObjectId = Schema.ObjectId;

var NGrams = natural.NGrams,
	wordnet = new natural.WordNet('./cache'),
	tokenizer = new natural.TreebankWordTokenizer();
natural.LancasterStemmer.attach();

// Add an item to the array, if it doesn't already exist,
// in order to mimic a set
function merge(array, newItem) {
	array.forEach(function(i) {
		if (i === newItem) return;
	});
	array.push(newItem);
} 

var ActivityItemSchema = new Schema({
	guid: {type: String, index: { unique: true }, required: true},
	user: {type: ObjectId, index: true, ref: "Identity"}, 
	message: {type: String, default: ""},
	media: [{}],
	posted_at: {type: Date, default: Date.now},
	platform: {type: String, default: "unknown"},
	read: {type: Boolean, default: false},
	liked: {type: Boolean, default: false},
	disliked: {type: Boolean, default: false},
	ratings: {},
	rating_basis: {},
	attributes: {},
	characteristics: [{type: ObjectId, ref: "Characteristic"}],
	topics: [{type: ObjectId, ref: "Topic"}],
	external_resources: [{type: ObjectId, ref: "ExternalResource"}],
	data: {},
	activity: [{}],
	analyzed_at: {type: Date, default: (function () { return new Date(1); }), index: true},
	created_at: {type: Date, default: Date.now, index: true}
});

ActivityItemSchema.methods.analyze = function(cb) {
	var self = this;
	var item = self;
	var AI = this;
	(function analyze_me(item, cb) {
		var Topic = mongoose.model('Topic'),
			JunkTopic = mongoose.model('JunkTopic'),
			AI = mongoose.model('ActivityItem');
		
		var error = null;
		
		var ratings = item.ratings || {};
		var characteristics = item.characteristics || [];
		var topics = item.topics || [];
		if (!ratings.overall) {
			ratings.overall = 0;
		}
		var message = item.message.toLowerCase();
		
		var url_pattern = /\(?\bhttps?:\/\/[-A-Za-z0-9+&@#\/%?=~_()|!:,.;]*[-A-Za-z0-9+&@#\/%=~_()|]/gi;
		var hash_pattern = /#[a-zA-Z_0-9]*/gi;
		
		var urls = message.match(url_pattern) || [];
		var hashtags = message.match(hash_pattern) || [];
		
		var keywords = [];

		// Add URLs to list of keywords
		urls.forEach(function(url) {
			var domain = url.substr(url.indexOf("//") + 2);
			// Cut off at first slash in URL, if one exists
			domain = domain.substr(0, domain.indexOf("/")) || domain;
			merge(keywords, domain);
		});

		// Add hashtags
		hashtags.forEach(function(tag) {
			tag = tag.substring(1);
			merge(keywords, tag);
		});
		
		// Natural language analysis of remainder of message
		message = message
					.remove_urls()
					.remove_hashtags()
					.remove_screen_names()
					.replace_punctuation();
		var chunks = message.split(" ");
		var new_chunks = [];
		chunks.forEach(function(chunk) {
			// Not sure the purpose of this
			if (chunk.indexOf("'") == -1) {
				new_chunks.push(chunk);
			}
		});
		var words = tokenizer.tokenize(message);
		
		var ngram_length = words.length;
		var phrases = [];
		while (ngram_length > 1) {
			var tmp_ngrams = NGrams.ngrams(words, ngram_length);
			tmp_ngrams.forEach(function(phrase) {
				phrases.push({text: phrase.join(" ")});
				phrases.push({text: phrase.join("")});
			});
			ngram_length--;
		}
		
		var tmp_words = [];
		words.forEach(function(word) {
			if (word.length > 2) {
				tmp_words.push(word);
			}
		});
		words = tmp_words;
		
		check_phrases();
		
		// Check topics for phrase matches
		function check_phrases() {
			//console.log(phrases);
			Topic.find()
				.or(phrases)
				.run(function(err, topics) {
				if (!err && topics) {
					topics.forEach(function(topic) {
						merge(words, topic.text);
					});
				}
				remove_topics_from_words();
			});
		}
		
		function remove_topics_from_words () {
			var tmp_words = [];
			
			JunkTopic.find({text: {"$in": words}}, function(err, topics) {
				if (err || !topics) {
					topics = [];
				}
				words.forEach(function(word) {
					var found = false;
					topics.forEach(function(topic) {
						if (topic.text == word) {
							found = true;
						}
					});
					if (!found && word.length > 3) {
						tmp_words.push(word);
					}
				});
				words = tmp_words;
				tmp_words = [];
				//console.log("okay, let's go! lookup_next_word()!");
				
				Topic.find({text: {"$in": words}}, function(err, topics) {
					if (err || !topics) {
						topics = [];
					}
					words.forEach(function(word) {
						var found = false;
						topics.forEach(function(topic) {
							if (topic.text == word) {
								found = true;
							}
						});
						if (found) {
							keywords.push(word);
						} else {
							tmp_words.push(word);
						}
					});
				
					words = tmp_words;
				
					lookup_next_word();
				});
				
			});
		}
		
		function lookup_next_word() {
			if (words.length == 0) {
				return add_topics();
			}
			word = words.shift();

			var neither = 0;
			var noun = 0;
			var verb = 0;

			if (word.length > 3) {
				// Numbers
				if (word.match(/^[0-9]*$/)) {
					classify_word(word, noun, verb, neither);
				// Everything else
				} else {
					wordnet.lookup(word, function(results) {
						results.forEach(function(result) {
							if (result.pos == "n") {
								noun++;
							} else if (result.pos == "v") {
								verb++;
							} else if (result.pos == "a" || 
									   result.pos == "r" || 
									   result.pos == "s") {
								neither++;
							}
						});
						classify_word(word, noun, verb, neither);
					});
					return;
				}
			// Automatically junk any word under 4 characters
			} else {
				save_junk_topic(word);
				lookup_next_word();
			}
		}

		function classify_word(w, n, v, neither) {
			if (n === 0 && neither > v) {
				save_junk_topic(w);
			} else {
				merge(keywords, w);
			}
			lookup_next_word();
		}
		
		function save_junk_topic(word) {
			JunkTopic.findOne({text: word}, function(err, topic) {
				if (err || (topic && topic.text == word)) {
					return;
				}
				var junker = new JunkTopic({text: word});
				junker.save(function(err) {
					// err?
				});
			});
		}
		
		function add_topics() {
			var existing_topics = [];
			//console.log("Getting topics");
			
			if (keywords.length > 0) {
				Topic.find({text: {"$in": keywords}}, function (err, t) {
					existing_topics = t;
					add_new_topics();
				});
			} else {
				done_with_topics();
			}
			
			function add_new_topics() {
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
				
				function add_each_topic() {
					if (new_topics.length == 0) {
						return done_adding();
					}
					topic_text = new_topics.shift();
					var topic = new Topic({text: topic_text, ratings: {overall: 0}});
					topic.save(function(err) {
						add_each_topic();
					});
				}
				add_each_topic();
			}
			
			function unique_ids (ids) {
				var unique = [];

				ids.forEach(function (id) {
					var found = false;
					unique.forEach(function (u) {
						if (String(u) == String(id)) {
							found = true;
						}
					});
					if (!found) {
						unique.push(id);
					}
				});
				return unique;
			}
			
			function done_adding() {
				var topic_ids = [];
				var topic_texts = [];
				Topic.find({text: {"$in": keywords}}, function(err, t) {
					t.forEach(function(topic) {
						topic_ids.push(topic.id);
						topic_texts.push(topic.text);
					});
					if (!item.topics || !(item.topics.length > 0)) {
						item.topics = topic_ids;
					} else {
						topic_ids.forEach(function(new_topic) {
							merge(item.topics, new_topic);
						});
					}
					//console.log("ADDED TOPIC IDS! "+item.topics.length);
					//console.log(self.message);
					//console.log("Topics: "+topic_texts.join(", "));
					item.topics = unique_ids(item.topics);
					item.commit("topics");
					item.save(function(err) {
						t.forEach(function(topic) {
							topic.save(function(err) {
								// err
							});
						});
					});
					
					done_with_topics();
				});

			}
			
			function done_with_topics() {
				//console.log("calling back... "+item.topics.length);
				
				rate_that_shit();
			}
			
			function rate_that_shit() {
				var topic_ratings = 0;
				var topic_count = 0;
				var char_ratings = 0;
				var char_count = 0;
				var user_rating = 0;
				var factors = [];
				
				AI.findOne({_id: item.id})
				.populate("characteristics")
				.populate("topics")
				.populate("user")
				.run(function(err, _item) {
					if (!err && _item) {
						_item.topics.forEach(function(topic) {
							if (topic.ratings.overall > 0 || topic.ratings.overall < 0) {
								if (parseInt(topic.ratings.overall) != 0) {
									topic_ratings += parseFloat(topic.ratings.overall);
									topic_count++;
								}
							}
						});
						if (topic_ratings != 0) {
							factors.push(topic_ratings/topic_count);
						}
						
						_item.characteristics.forEach(function(ch) {
							if (parseFloat(ch.ratings.overall) != 0) {
								char_ratings += parseFloat(ch.ratings.overall)*.2;
								char_count++;
							}
						});
						if (char_ratings != 0) {
							factors.push(char_ratings/char_count);
						}
						
						user_rating = parseInt(_item.user.closeness) || 0;
						if (_item.user.ratings && parseFloat(_item.user.ratings.overall) != 0) {
							user_rating += parseFloat(_item.user.ratings.overall);
						}
						if (user_rating != 0) {
							// it's so nice, i wanna push the same score twice
							factors.push(user_rating);
							factors.push(user_rating);
						}
					}
					topic_count = topic_count > 1 ? topic_count : 1;
					char_count = char_count > 1 ? char_count : 1;
					ratings.user = user_rating;
					ratings.topics = topic_ratings / topic_count;
					ratings.characteristics = char_ratings / char_count;
					var sum = 0;
					factors.forEach(function (f) { sum += f; });
					ratings.overall = factors.length > 0 ? sum/factors.length : 0;
					
					//console.log("RATINGS");
					//console.log(ratings);
					item.ratings = ratings;
					item.commit("ratings");
					cb(error, item);
					
				});
				//rate_by_topics();
				//rate_by_characteristics();
				//rate_by_behavior();
				
				//Topic.find({_id: {"$in": item.topics}}, function (
			}
		}
	})(item, cb);
}


ActivityItemSchema.methods.unshorten_urls = function(cb) {
	var self = this;
	
	if (!this.ratings) {
		this.ratings = {};
	}
	if (!this.ratings.overall) {
		this.ratings.overall = 0;
	}
	
	var orig = self.message
	unshorten_urls(self.message, function(m) {
		self.message = m;
		cb();
	});
}

function unshorten_urls(_message, cb) {
	var regex = /\(?\bhttps?:\/\/[-A-Za-z0-9+&@#\/%?=~_()|!:,.;]*[-A-Za-z0-9+&@#\/%=~_()|]/gi;
	var matches = _message.match(regex);
	if (matches) {
		function unshorten_next () {
			if (matches.length == 0) {
				return cb(_message);
			}
			var match = matches.pop();
			unshortener.expand(match, function(url) {
				if (match != url.href) {
					match = match.replace(/ /g, "%20");
					// unshortener might return an invalid URL....
					// https://github.com/Swizec/node-unshortener/issues/8
					if (/^https?:\/\//.test(url.href)) {
						_message = _message.replace(match, url.href);
					}
				}
				unshorten_next();
			});
		}
		unshorten_next();
		function finished() {
			cb(_message);
		}
	} else {
		cb(_message);
	}
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


mongoose.model('ActivityItem', ActivityItemSchema);

exports.ActivityItem = ActivityItemSchema;

