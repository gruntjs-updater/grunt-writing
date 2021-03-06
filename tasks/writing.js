/*
 * grunt-writing
 * https://github.com/colingourlay/grunt-writing
 *
 * Copyright (c) 2013 Colin Gourlay
 * Licensed under the MIT license.
 */

'use strict';

var fs = require('fs');

var _ = require('lodash');
var jade = require('jade');
var jsYAML = require('js-yaml');
var marked = require('marked');
var pygmentize = require('pygmentize-bundled');
var RSS = require('rss');

marked.setOptions({
  gfm: true,
  anchors: true,
  highlight: function (code, lang, callback) {
    pygmentize({
      format: 'html',
      lang: lang
    }, code, function (err, result) {
      callback(err, result.toString());
    });
  }
});

function writing(grunt) {
  grunt.registerMultiTask('writing', 'Combines markdown and templates to create static pages.', function () {
    var task = this;
    var done = task.async();
    var options = task.options();

    var meta = task.data.meta || {};
    meta.rssURL = meta.url + '/rss.xml';

    var feed = new RSS({
      title: meta.title,
      description: meta.description,
      author: meta.author,
      site_url: meta.url,
      feed_url: meta.rssURL,
      pub_date: new Date(),
      language: meta.lang
    });

    var templates = {};
    _.each(['post', 'index', 'archive'], function (template) {
      var filename = task.data.templates + '/' + template + '.jade';

      templates[template] = jade.compile(fs.readFileSync(filename, 'utf8'), {
        pretty: true,
        filename: filename
      });

      grunt.log.writeln('Compiled template: ' + filename);
    });

    var posts = [];
    var numRemainingPosts = grunt.file.expand({filter: 'isFile'}, [task.data.posts + '/**']).length;

    grunt.file.recurse(task.data.posts, function (filepath) {
      var post = {};
      var text = fs.readFileSync(filepath, 'utf8');

      try {
        if (text.indexOf('----') === 0) {
          post = jsYAML.load(text.split('----')[1]);
          post.markdown = _.rest(text.split('----'), 2).join('');
        } else {
          grunt.fail.fatal('incorrect metadata format: ' + filepath);
        }
      } catch (e) {
        grunt.fail.fatal('exception while parsing: ' + filepath);
      }

      if (!post.markdown.length) {
        grunt.fail.fatal('no content: ' + filepath);
      }

      post.url = '/' + filepath.split('/').reverse()[0].replace('.markdown', '/');
      post.filepath = task.data.dest + post.url + 'index.html';

      marked(post.markdown, function (err, content) {
        if (err) {
          grunt.fail.fatal('failed to parse markdown: ', filepath);
        }

        post.content = content;
        post.teaser = content.split('</p>')[0] + '</p>';
        posts.push(post);

        if (!--numRemainingPosts) {
          posts.sort(function (a, b) {
            return b.date - a.date;
          });

          posts.forEach(function (post, index) {
            if (index > 0) {
              post.next = posts[index - 1];
            }
            if (index < posts.length - 1) {
              post.previous = posts[index + 1];
            }

            grunt.file.write(post.filepath, templates.post({meta: meta, post: post}));
            grunt.log.writeln('Rendered post: ' + post.title);

            feed.item({
              title: post.title,
              description: post.teaser,
              url: meta.url + post.url,
              date: post.date.toString()
            });
          });

          grunt.file.write(task.data.dest + '/index.html', templates.index({meta: meta, posts: posts}));
          grunt.log.writeln('Rendered Index page: /');
          grunt.file.write(task.data.dest + '/archive/index.html', templates.archive({meta: meta, posts: posts}));
          grunt.log.writeln('Rendered Archive page: /archive/');
          grunt.file.write(task.data.dest + '/rss.xml', feed.xml());
          grunt.log.writeln('Rendered RSS Feed: /rss.xml');

          done();
        }
      });
    });
  });
}

module.exports = writing;
