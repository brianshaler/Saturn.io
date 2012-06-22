var util = require('util')
  , qs = require('querystring')
  // Dependencies
  , request = require('request')
  , es = require('event-stream')
  , clarinet = require('clarinet')
  // vars
  , freeCat
  ;

freeCat = function (topics, cb) {
  if (typeof topics === 'string') topics = [ topics ]
  var lookup
    , results = []
    ;

  lookup = function (item) {
    var q =
        { query: JSON.stringify({ query:
          { name: item
          , type: [{ name: null }]
          }
        })}
      , parse = clarinet.createStream()
      , topic = false
      , isTopic = function (name) {
          if (name === 'name') topic = true
        }


    parse.write = function (data) {
      this._parser.write(data.toString())
      return true
    }
    parse.on('openobject', isTopic)
    parse.on('key', isTopic)
    parse.on('value', function (value) {
      if (topic) {
        parse.emit('data', value)
        topic = false
      }
    })
    return  request(
      'http://www.freebase.com/api/service/mqlread?' + qs.stringify(q)
      ).pipe(parse)
  }

  results = topics.map(lookup)
  if (typeof cb === 'function') {
    es.concat.apply(null, results)
      .pipe(es.writeArray(cb))
  } else {
    return es.concat.apply(null, results)
  }

}

module.exports = exports = freeCat

// Example usage

// freeCat(['Jon Snow', 'Arya Stark', 'Ghost'], function (e, results) {
//   if (e) throw e
//   console.log(results.reverse())
// })
//
// freeCat(['Doc Watson', 'Earl Scrugs', 'Woody Guthrie']).pipe(es.log())

