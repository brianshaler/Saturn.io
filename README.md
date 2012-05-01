Saturn.io
=========

FYI, it's pretty hacky for now, but it theoretically works... or at least some features do.

Installation
------------

1. Install some extra node modules:

  $ npm install -g express-mvc-framework
  $ npm install mongodb hook log mkdirp

2. Make a copy of the sample config

    $ cp conf/conf.js.sample conf/conf.js

3. Run MongoDB
4. Run the app

    $ eb

Ignore the sidebar that shows up when you're not logged in. Log in first and then use it.

One important thing is to create the cron job tasks once you log in for the first time:

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
