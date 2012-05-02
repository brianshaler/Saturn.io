Saturn.io
=========

FYI, it's pretty hacky for now, but it theoretically works... or at least some features do.

Installation
------------

Install some extra node modules:

    $ npm install -g express-mvc-framework
    $ npm install mongodb hook log mkdirp

Make a copy of the sample config:

    $ cp conf/conf.js.sample conf/conf.js

Note: If you are using the provided API keys/tokens, you MUST use "local.saturn.io:3000" (set local.saturn.io -> 127.0.0.1 in hosts). If you [set up a new dev app on Twitter](https://dev.twitter.com/apps/), you can set the callback URL et al to anything you want, including localhost, 127.0.0.1, etc.

Run MongoDB.

Run the app:

    $ eb

Ignore the sidebar that shows up when you're not logged in. Log in first and then use it.

One important thing is to create the cron job tasks (http://{{domain/ip, port}}/cron/manage) once you log in for the first time:

<table>
  <tr>
    <th>Controller</th><th>Method</th><th>Interval</th>
  </tr>
  <tr>
    <td>AnalysisController</td><td>analyze</td><td>10</td>
  </tr>
  <tr>
    <td>TwitterController</td><td>stream</td><td>10</td>
  </tr>
  <tr>
    <td>TopicController</td><td>analyze_trending</td><td>300</td>
  </tr>
</table>
