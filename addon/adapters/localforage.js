import Ember from 'ember';
import DS from 'ember-data';
import LFQueue from 'ember-localforage-adapter/utils/queue';
import LFCache from 'ember-localforage-adapter/utils/cache';
import isAsync from 'ember-localforage-adapter/utils/is-async';
import isObject from 'ember-localforage-adapter/utils/is-object';

export default DS.Adapter.extend(Ember.Evented, {

  defaultSerializer: 'localforage',
  queue: LFQueue.create(),
  cache: LFCache.create(),
  caching: 'model',
  coalesceFindRequests: true,

  shouldBackgroundReloadRecord() {
    return false;
  },

  shouldReloadAll() {
    return true;
  },

  /**
   * This is the main entry point into finding records. The first parameter to
   * this method is the model's name as a string.
   *
   * @method findRecord
   * @param store
   * @param {DS.Model} type
   * @param {Object|String|Integer|null} id
   */
  findRecord(store, type, id) {
    return this._getNamespaceData(type).then((namespaceData) => {
      const record = namespaceData.records[id];

      if (!record) {
        return Ember.RSVP.reject();
      }

      return record;
    });
  },

  findAll(store, type) {
    return this._getNamespaceData(type).then((namespaceData) => {
      const records = [];

      for (let id in namespaceData.records) {
        records.push(namespaceData.records[id]);
      }

      return records;
    });
  },

  findMany(store, type, ids) {
    return this._getNamespaceData(type).then((namespaceData) => {
      const records = [];

      for (let i = 0; i < ids.length; i++) {
        const record = namespaceData.records[ids[i]];

        if (record) {
          records.push(record);
        }
      }

      return records;
    });
  },

  queryRecord(store, type, query) {
    var modelName = type.modelName;
    var proj = this._extractProjectionFromQuery(modelName, type, query);
    var _this = this;
    return new Ember.RSVP.Promise(function(resolve, reject) {
      _this._getNamespaceData(type).then((namespaceData) => {
        const record = _this._query(namespaceData.records, query, true);

        if (!record) {
          reject(new Error(`Record of type ${modelName} with id '${record.id}' is not fulfilling specified query`));
        }

        _this._completeLoadRecord(store, type, record, proj).then(function(completeRecord) {
          resolve(completeRecord);
        });
      }).catch(function(reason) {
        reject(reason);
      });
    });
  },

  /**
   *  Supports queries that look like this:
   *   {
   *     <property to query>: <value or regex (for strings) to match>,
   *     ...
   *   }
   *
   * Every property added to the query is an "AND" query, not "OR"
   *
   * Example:
   * match records with "complete: true" and the name "foo" or "bar"
   *  { complete: true, name: /foo|bar/ }
   */
  query(store, type, query) {
    var modelName = type.modelName;
    var proj = this._extractProjectionFromQuery(modelName, type, query);
    var _this = this;
    return new Ember.RSVP.Promise(function(resolve, reject) {
      _this._getNamespaceData(type).then((namespaceData) => {
        var recordArray = _this._query(namespaceData.records, query);
        let promises = Ember.A();
        for (let i = 0; i < recordArray.length; i++) {
          let record = recordArray[i];
          promises.pushObject(_this._completeLoadRecord(store, type, record, proj));
        }

        Ember.RSVP.all(promises).then(() => {
          resolve(recordArray);
        }).catch(function(reason) {
          reject(reason);
        });
      }).catch(function(reason) {
        reject(reason);
      });
    });
  },

  _query(records, query, singleMatch) {
    const results = singleMatch ? null : [];

    for (let id in records) {
      const record = records[id];
      let isMatching = false;

      for (let property in query) {
        const queryValue = query[property];

        if (queryValue instanceof RegExp) {
          isMatching = queryValue.test(record[property]);
        } else {
          isMatching = record[property] === queryValue;
        }

        if (!isMatching) {
          break; // all criteria should pass
        }
      }

      if (isMatching || Ember.$.isEmptyObject(query)) {
        if (singleMatch) {
          return record;
        }

        results.push(record);
      }
    }

    return results;
  },

  createRecord: updateOrCreate,

  updateRecord: updateOrCreate,

  deleteRecord(store, type, snapshot) {
    return this.queue.attach((resolve) => {
      this._getNamespaceData(type).then((namespaceData) => {
        delete namespaceData.records[snapshot.id];

        this._setNamespaceData(type, namespaceData).then(() => {
          resolve();
        });
      });
    });
  },

  generateIdForRecord() {
    return Math.random().toString(32).slice(2).substr(0, 5);
  },

  // private

  /**
   * Retrieves projection from query and returns it.
   * Retrieved projection removes from the query.
   *
   * @method _extractProjectionFromQuery
   * @private
   *
   * @param {String} modelName The name of the model type.
   * @param {subclass of DS.Model} typeClass Model type.
   * @param {Object} [query] Query parameters.
   * @param {String} query.projection Projection name.
   * @return {Object} Extracted projection from query or null
   *                  if projection is not set in query.
   */
  _extractProjectionFromQuery: function(modelName, typeClass, query) {
    if (query && query.projection) {
      let proj = query.projection;
      if (typeof query.projection === 'string') {
        let projName = query.projection;
        proj = typeClass.projections.get(projName);
      }

      delete query.projection;
      return proj;
    }

    return null;
  },

  /**
   * Completes loading record for given projection.
   *
   * @method _completeLoadingRecord
   * @private
   *
   * @param {subclass of DS.Store} store Store to use for complete loading record.
   * @param {subclass of DS.Model} type Model type.
   * @param {Object} record Main record loaded by adapter.
   * @param {Object} projection Projection for complete loading of record.
   * @return {Object} Completely loaded record with all properties
   *                  include relationships corresponds to given projection
   */
  _completeLoadRecord: function(store, type, record, projection) {
    let promises = Ember.A();
    if (!Ember.isNone(projection)) {
      let attributes = projection.attributes;
      for (var attrName in attributes) {
        if (attributes.hasOwnProperty(attrName)) {
          this._replaceIdToHash(store, type,  record, attributes, attrName, promises);
        }
      }
    }

    return Ember.RSVP.all(promises).then(() => {
      let relationshipNames = Ember.get(type, 'relationshipNames');
      let belongsTo = relationshipNames.belongsTo;
      for (let i = 0; i < belongsTo.length; i++) {
        let relationshipName = belongsTo[i];
        if (!isAsync(type, relationshipName) && !isObject(record[relationshipName])) {
          record[relationshipName] = null;
        }
      }

      let hasMany = relationshipNames.hasMany;
      for (let i = 0; i < hasMany.length; i++) {
        let relationshipName = hasMany[i];
        if (!Ember.isArray(record[relationshipName])) {
          record[relationshipName] = [];
        } else {
          if (!isAsync(type, relationshipName)) {
            let hasUnloadedObjects = false;
            for (let j = 0; j < record[relationshipName].length; j++) {
              if (!isObject(record[relationshipName][j])) {
                hasUnloadedObjects = true;
              }
            }

            if (hasUnloadedObjects) {
              record[relationshipName] = [];
            }
          }
        }
      }

      return record;
    });
  },

  _loadRelatedRecord(store, type, id, proj) {
    let relatedRecord = store.peekRecord(proj.modelName, id);
    if (Ember.isNone(relatedRecord)) {
      let options = {
        id: id,
        projection: proj
      };
      return this.queryRecord(store, type, options);
    } else {
      let relatedRecordObject = relatedRecord.serialize({ includeId: true });
      return this._completeLoadRecord(store, type, relatedRecordObject, proj);
    }
  },

  _replaceIdToHash(store, type,  record, attributes, attrName, promises) {
    let attr = attributes[attrName];
    let relatedModelType = (attr.kind === 'belongsTo' || attr.kind === 'hasMany') ? store.modelFor(attr.modelName) : null;
    switch (attr.kind) {
      case 'attr':
        break;
      case 'belongsTo':
        if (!isAsync(type, attrName)) {
          // let primaryKeyName = this.serializer.get('primaryKey');
          let id = record[attrName];
          if (!Ember.isNone(id)) {
            promises.pushObject(this._loadRelatedRecord(store, relatedModelType, id, attr).then((relatedRecord) => {
              delete record[attrName];
              record[attrName] = relatedRecord;
            }));
          }
        }

        break;
      case 'hasMany':
        if (!isAsync(type, attrName)) {
          if (Ember.isArray(record[attrName])) {
            let ids = Ember.copy(record[attrName]);
            delete record[attrName];
            record[attrName] = [];
            let pushToRecordArray = (relatedRecord) => {
              record[attrName].push(relatedRecord);
            };

            for (var i = 0; i < ids.length; i++) {
              let id = ids[i];
              promises.pushObject(this._loadRelatedRecord(store, relatedModelType, id, attr).then(pushToRecordArray));
            }
          } else {
            record[attrName] = [];
          }
        }

        break;
      default:
        throw new Error(`Unknown kind of projection attribute: ${attr.kind}`);
    }
  },

  _setNamespaceData(type, namespaceData) {
    const modelNamespace = this._modelNamespace(type);

    return this._loadData().then((storage) => {
      if (this.caching !== 'none') {
        this.cache.set(modelNamespace, namespaceData);
      }

      storage[modelNamespace] = namespaceData;

      return window.localforage.setItem(this._adapterNamespace(), storage);
    });
  },

  _getNamespaceData(type) {
    const modelNamespace = this._modelNamespace(type);

    if (this.caching !== 'none') {
      const cache = this.cache.get(modelNamespace);

      if (cache) {
        return Ember.RSVP.resolve(cache);
      }
    }

    return this._loadData().then((storage) => {
      const namespaceData = storage && storage[modelNamespace] || { records: {} };

      if (this.caching === 'model') {
        this.cache.set(modelNamespace, namespaceData);
      } else if (this.caching === 'all') {
        if (storage) {
          this.cache.replace(storage);
        }
      }

      return namespaceData;
    });
  },

  _loadData() {
    return window.localforage.getItem(this._adapterNamespace()).then((storage) => storage ? storage : {});
  },

  _modelNamespace(type) {
    return type.url || type.modelName;
  },

  _adapterNamespace() {
    return this.get('namespace') || 'DS.LFAdapter';
  }
});

function updateOrCreate(store, type, snapshot) {
  return this.queue.attach((resolve) => {
    this._getNamespaceData(type).then((namespaceData) => {
      const serializer = store.serializerFor(type.modelName);
      const recordHash = serializer.serialize(snapshot, { includeId: true });

      // update(id comes from snapshot) or create(id comes from serialization)
      const id = snapshot.id || recordHash.id;

      namespaceData.records[id] = recordHash;

      this._setNamespaceData(type, namespaceData).then(() => {
        resolve();
      });
    });
  });
}
