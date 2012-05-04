/**
 *  ActivityItem schema
 **/

var mongoose = require('mongoose'),
	unshorten = require('unshorten'),
	Schema = mongoose.Schema,
	natural = require('natural'),
	ObjectId = Schema.ObjectId;

var tokenizer = new natural.TreebankWordTokenizer();
natural.LancasterStemmer.attach();
var wordnet = new natural.WordNet('./cache');
var NGrams = natural.NGrams;

var ActivityItemSchema = new Schema({
	
	guid: {type: String, unique: true, index: true, required: true},
	user: {type: ObjectId, index: true, ref: "Identity"}, 
	message: {type: String},
	posted_at: {type: Date},
	platform: {type: String},
	read: {type: Boolean},
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
	analyzed_at: {type: Date, default: (function () { return new Date(1); })},
	created_at: {type: Date, default: Date.now}
	
});

ActivityItemSchema.methods.analyze = function (cb) {
	var self = this;
	var item = self;
	var AI = this;
	(function analyze_me (item, cb) {
		console.log('Schema analyze_me');

		var Topic = mongoose.model('Topic');
		var JunkTopic = mongoose.model('JunkTopic');
		var AI = mongoose.model('ActivityItem');
		
		var error = null;
		
		var ratings = item.ratings || {};
		var characteristics = item.characteristics || [];
		var topics = item.topics || [];
		if (!ratings.overall) {
			ratings.overall = 0;
		}
		var message = item.message.toLowerCase();
		
		var url_pattern = /\(?\bhttps?:\/\/[-A-Za-z0-9+&@#\/%?=~_()|!:,.;]*[-A-Za-z0-9+&@#\/%=~_()|]/gi;
		var urls = message.match(url_pattern);
		var hash_pattern = /#[a-zA-Z_0-9]*/gi;
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
		
		// Natural language analysis of message
		message = message.remove_urls().remove_hashtags().remove_screen_names().replace_punctuation();
		var chunks = message.split(" ");
		var new_chunks = [];
		chunks.forEach(function (chunk) {
			if (chunk.indexOf("'") == -1) {
				new_chunks.push(chunk);
			}
		});
		message = chunks.join(" ");
		var words = tokenizer.tokenize(message);//.tokenizeAndStem();
		
		var ngram_length = words.length;
		var phrases = [];
		if (words.length > 1) {
			phrases.push({text: words.join(" ")});
			phrases.push({text: words.join("")});
		}
		while (ngram_length > 1) {
			var tmp_ngrams = NGrams.ngrams(words, ngram_length);
			tmp_ngrams.forEach(function (phrase) {
				phrases.push({text: phrase.join(" ")});
				phrases.push({text: phrase.join("")});
			});
			ngram_length--;
		}
		
		var tmp_words = [];
		words.forEach(function (word) {
			if (word.length > 2) {
				tmp_words.push(word);
			}
		});
		words = tmp_words;
		
		//console.log(words.join(","));
		
		check_phrases();
		
		function check_phrases () {
			Topic.find()
			.or(phrases)
			.run(function (err, topics) {
				//console.log("Topics by phrase: ");
				//console.log(topics);
				
				if (!err && topics) {
					topics.forEach(function (topic) {
						var found = false;
						words.forEach(function (word) {
							if (word == topic.text) {
								found = true;
							}
						});
						if (!found) {
							console.log("ADDING FROM PHRASE: "+topic.text);
							words.push(topic.text);
						}
					});
				}
				remove_topics_from_words();
			});
		}
		
		function remove_topics_from_words () {
			var tmp_words = [];
			
			JunkTopic.find({text: {"$in": words}}, function (err, topics) {
				if (err || !topics) {
					topics = [];
				}
				words.forEach(function (word) {
					var found = false;
					topics.forEach(function (topic) {
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
				
				Topic.find({text: {"$in": words}}, function (err, topics) {
					if (err || !topics) {
						topics = [];
					}
					words.forEach(function (word) {
						var found = false;
						topics.forEach(function (topic) {
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
		
		function lookup_next_word () {
			if (words.length == 0) {
				return add_topics();
			}
			word = words.shift();

			var neither = 0;
			var noun = 0;
			var verb = 0;

			if (word.length > 3) {
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
				save_junk_topic(word);
				lookup_next_word();
			}
		}
		function classify_word (w, n, v, neither) {
			if (n == 0 && neither > v) {
				save_junk_topic(w);
				//console.log(w+": is ("+n+":"+v+"/"+neither+") I don't know.. Junk?");
			} else {
				//console.log(w+": noun:"+n+" / verb:"+v+" / neither:"+neither);
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
		
		function save_junk_topic (word) {
			JunkTopic.findOne({text: word}, function (err, topic) {
				if (err || (topic && topic.text == word)) {
					return;
				}
				var junker = new JunkTopic({text: word});
				junker.save(function (err) {
					// err?
				});
			});
		}
		
		function add_topics () {
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
				var topic_texts = [];
				Topic.find({text: {"$in": keywords}}, function (err, t) {
					t.forEach(function (topic) {
						topic_ids.push(topic.id);
						topic_texts.push(topic.text);
					});
					if (!item.topics || !(item.topics.length > 0)) {
						item.topics = topic_ids;
					} else {
						topic_ids.forEach(function (new_topic) {
							var found = false;
							item.topics.forEach(function (existing) {
								if (new_topic == existing) {
									found = true;
								}
							});
							if (!found) {
								item.topics.push(new_topic);
							}
						});
					}
					//console.log("ADDED TOPIC IDS! "+item.topics.length);
					//console.log(self.message);
					//console.log("Topics: "+topic_texts.join(", "));
					item.commit("topics");
					item.save(function (err) {
						t.forEach(function (topic) {
							topic.save(function (err) {
								// err
							});
						});
					});
					
					done_with_topics();
				});

			}
			
			function done_with_topics () {
				//console.log("calling back... "+item.topics.length);
				
				rate_that_shit();
			}
			
			function rate_that_shit () {
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
				.run(function (err, _item) {
					if (!err && _item) {
						_item.topics.forEach(function (topic) {
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
						
						_item.characteristics.forEach(function (ch) {
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


ActivityItemSchema.pre('save', function (next) {
	var self = this;
	
	if (!this.ratings) {
		this.ratings = {};
	}
	if (!this.ratings.overall) {
		this.ratings.overall = 0;
	}
	
	var orig = self.message
	//console.log("Starting message: "+self.message);
	unshorten_urls(self.message, function (m) {
		//console.log("New message (1): "+m);
		if (self.message != m) {
			unshorten_urls(m, function (m) {
				//console.log("New message (2): "+m);
				self.message = m;
				next();
			});
		} else {
			next();
		}
	});
	
	/** /
	var regex = /\(?\bhttp:\/\/[-A-Za-z0-9+&@#\/%?=~_()|!:,.;]*[-A-Za-z0-9+&@#\/%=~_()|]/gi;
	var matches = self.message.match(regex);
	if (matches) {
		console.log(matches);
		function unshorten_next () {
			if (matches.length == 0) {
				return finished();
			}
			var match = matches.pop();
			unshorten(match, function (url) {
				console.log("Unshortened: "+match+" => "+url);
				if (match != url) {
					self.message.replace(match, url);
				}
				unshorten_next();
			});
		}
		unshorten_next();
		function finished () {
			next();
		}
	} else {
		next();
	}
	/**/
});

function unshorten_urls (_message, cb) {
	var regex = /\(?\bhttps?:\/\/[-A-Za-z0-9+&@#\/%?=~_()|!:,.;]*[-A-Za-z0-9+&@#\/%=~_()|]/gi;
	var matches = _message.match(regex);
	if (matches) {
		function unshorten_next () {
			if (matches.length == 0) {
				return finished();
			}
			var match = matches.pop();
			if (match.length > 28) {
				unshorten_next();
			} else {
				unshorten(match, function (url) {
					if (match != url) {
						match = match.replace(/ /g, "%20");
						_message = _message.replace(match, url);
					}
					unshorten_next();
				});
			}
		}
		unshorten_next();
		function finished () {
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

