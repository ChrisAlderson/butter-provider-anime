'use strict';

var _ = require('lodash');
var Generic = require('butter-provider');
var inherits = require('util').inherits;
var Q = require('q');
var querystring = require('querystring');
var request = require('request');
var sanitize = require('butter-sanitize');

var AnimeApi = function (args) {
  if (!(this instanceof AnimeApi)) return new AnimeApi(args);

  Generic.call(this, args);

  this.apiURL = this.args.apiURL || ['https://anime.api-fetch.website/'];
};

inherits(AnimeApi, Generic);

AnimeApi.prototype.config = {
  name: 'AnimeApi',
  uniqueId: 'mal_id',
  tabName: 'AnimeApi',
  args: {
    apiURL: Generic.ArgType.ARRAY
	},
  metadata: 'trakttv:anime-metadata'
};

function formatFetch(animes) {
  var results = _.map(animes, function (anime) {
    var result = {
      mal_id: anime._id,
      year: anime.year,
      title: anime.title,
      genre: anime.genres,
      rating: anime.rating,
      poster: anime.images.poster,
      type: anime.type,
    };

    if (result.type === Generic.ItemType.TVSHOW) {
      result = _.extend(result, {
        num_seasons: anime.num_seasons // Not in docs
      });
    } else if (result.type === Generic.ItemType.MOVIE) {
      // Do nothing
    } else {
      throw Error('unsupported type: \'' + anime.type + '\'!');
    }

    return result
  });

  return {
    results: sanitize(results),
    hasMore: true
  };
};

function formatDetail(anime) {
  var result = {
    mal_id: anime._id,
    year: anime.year,
    title: anime.title,
    genre: anime.genres,
    rating: anime.rating,
    poster: anime.images.poster,
    type: anime.type,
    backdrop: anime.images.fanart,
    subtitle: {},
    synopsis: anime.synopsis,

    runtime: anime.runtime, // Not in docs
    status: anime.status // Not in docs
  };

  if (anime.type === Generic.ItemType.TVSHOW) {
    result = _.extend(result, {
      episodes: anime.episodes,
      num_seasons: anime.num_seasons // Not in docs
    });
  } else if (anime.type === Generic.ItemType.MOVIE) {
    result = _.extend(ret, {
      torrents: anime.torrents,
      trailer: anime.trailer
    });
  } else {
    throw Error('unsupported type: \'' + anime.type + '\'!');
  }

  return sanitize(result);
};

function processCloudFlareHack(options, url) {
  var req = options;
  var match = url.match(/^cloudflare\+(.*):\/\/(.*)/);
  if (match) {
    req = _.extend(req, {
      uri: match[1] + '://cloudflare.com/',
      headers: {
        'Host': match[2],
        'User-Agent': 'Mozilla/5.0 (Linux) AppleWebkit/534.30 (KHTML, like Gecko) PT/3.8.0'
      }
    });
  }
  return req;
};

function get(index, url, that) {
  var deferred = Q.defer();

  var options = {
    url: url,
    json: true
  };

  var req = processCloudFlareHack(options, that.apiURL[index]);
  console.info('Request to AnimeApi', req.url);
  request(req, function (err, res, data) {
    if (err || res.statusCode >= 400) {
      console.warn('AnimeAPI endpoint \'%s\' failed.', that.apiURL[index]);
      if (index + 1 >= that.apiURL.length) {
        return deferred.reject(err || 'Status Code is above 400');
      } else {
        return get(index + 1, url, that);
      }
    } else if (!data || data.error) {
      err = data ? data.status_message : 'No data returned';
      console.error('API error:', err);
      return deferred.reject(err);
    } else {
      return deferred.resolve(data);
    }
  });

  return deferred.promise;
};

AnimeApi.prototype.extractIds = function (items) {
  return _.map(items.results, 'mal_id');
};

AnimeApi.prototype.fetch = function (filters) {
  var that = this;

  var params = {};
  params.sort = 'seeds';
  params.limit = '50';

  if (filters.keywords) {
    params.keywords = filters.keywords.replace(/\s/g, '% ');
  }

  if (filters.genre) {
    params.genre = filters.genre;
  }

  if (filters.order) {
    params.order = filters.order;
  }

  if (filters.sorter && filters.sorter !== 'popularity') {
    params.sort = filters.sorter;
  }

  filters.page = filters.page ? filters.page : 1;

  var index = 0;
  var url = that.apiURL[index] + 'animes/' + filters.page + '?' + querystring.stringify(params).replace(/%25%20/g, '%20');
  return get(index, url, that).then(formatFetch);
};

AnimeApi.prototype.random = function () {
	var that = this;
	var index = 0;
	var url = that.apiURL[index] + 'random/anime';
	return get(index, url, that).then(formatDetail);
};

AnimeApi.prototype.detail = function (torrent_id, old_data, debug) {
  var that = this;

  var index = 0;
  var url = that.apiURL[index] + "anime/" + torrent_id;
  return get(index, url, that).then(formatDetail);
};

module.exports = AnimeApi;
