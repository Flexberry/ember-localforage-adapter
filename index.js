/* jshint node: true */
'use strict';

module.exports = {
  name: 'ember-localforage-adapter',

  included: function(app) {
    this._super.included.apply(this._super, arguments);

    app.import({
      development: 'bower_components/localforage/dist/localforage.js',
      production:  'bower_components/localforage/dist/localforage.min.js'
    });
  }
};
