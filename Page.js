var _     = require("underscore");
var Class = require("infrastructure/lib/Class");
var path  = require("path");

var line = "       ";

function noArguments(){ return []; }
function dataResultExtender (res, data       ) { _.extend(res.data, data);           }
function commonDataSetter   ( res, data      ) { res.data = data;                    }
function callNext           ( req, res, next ) { next();                             }
function callRender         ( req, res, next ) { this.render(req, res);              }
function finalizeChain      ( req, res, next ) { next();                             }
function createDataNS       ( req, res, next ) { res.data = res.data || {};  next( null, req, res ); }

var Page = Class.extend("Page", {

  constructor: function(env, structure_name, name){
    var self = this, app = env.engines.express;
    this.env = env;

    if(!this.root) this.root = "/" + name;

    this.renderer = function(req, res){
      self.render( req, res );
    }

    var routes = [];
    for(var key in this){
      if(key.match(/^GET\s|^POST\s|^PUT\s|^DELETE\s|^ALL\s/)){
        var parts  = key.split(/\s+/);
        var method = parts[0].toLowerCase();
        var route;
        if(parts[1].indexOf("*") === 0 || parts[1].indexOf("/") === 0) route = self.root+parts[1];
        else route  = path.join(self.root, parts[1]).replace(/\\/g, "/");
        route = route.replace(/\/\//g, "/");
        if(route !== "/") route = route.replace(/\/$/, "");
        routes.push({method: method, path: route, key: key});
      }
    }

    if(this.pre) {
      for(var i = 0; i<routes.length; i++){
        var route = routes[i];
        app[route.method](route.path, this.parseCall( this.pre, true ).bind(this));
      }      
    }

    for(var i = 0; i<routes.length; i++){
      var route = routes[i];
      app[route.method](route.path, this.parseCall(self[route.key], !!this.after ).bind(this));
      env.i.do("log.sys", "route", route.method.toUpperCase()+line.slice(route.method.length) + route.path);
    }

    if(this.after) {
      for(var i = 0; i<routes.length; i++){
        var route = routes[i];
        app[route.method](route.path, this.parseCall( this.after, false ).bind(this));
      }      
    }

    Class.apply(this, arguments);
  },

  handleError: function(err, req, res, next){
    if(typeof this.error === "function") this.error.apply(this, arguments);
    else next(err);
  },

  parseCall: function(target, isPartOfChain, path ){
    if(_.isFunction(target)) return target;
    if(_.isString(target)){
      if(target.indexOf("@") === 0) return this.createSelfCaller(target, isPartOfChain);
      else if(target.indexOf("#") === 0) return isPartOfChain ? this.createTemplateSetter(target.replace("#","")) :  this.createTemplateRenderer(target.replace("#",""));
      else return this.createDoCaller( target, isPartOfChain, path );
    }
    else if(_.isArray(target))  return this.createChain     ( target, isPartOfChain );
    else if(_.isObject(target)) return this.createConcurent ( target, isPartOfChain );
  },

  createTemplateSetter: function(template_name){
    var helpers = this.env.helpers;
    return function(req, res, next){
      helpers.patch(res, "data.template", template_name);
      next();
    }
  },

  createTemplateRenderer: function(template_name){
    return function(req, res){ 
      this.env.helpers.patch(res, "data.template", template_name);
      this.render(req, res);
    };
  },

  createSelfCaller: function( target, isPartOfChain, path ){
    var self            = this;
    var i               = this.env.i;
    var parts           = target.replace(/([^|])([|])([^|])/g, "$1 $2 $3").split(/[^|][|][^|]/).map( function(part){ return part.trim(); } );
    var method          = parts[0].replace(/^@/, "");

    var argumentsGetter = this.createArgumentsGetter( parts[1] );
    var dataPatcher     = this.createDataPatcher( path || parts[2] );
    var finalizer       = this.getFinalizer( isPartOfChain );
    var _               = require("underscore");
    if(isPartOfChain){
      return function(req, res, next){
        var args = argumentsGetter.call(self, req, res, _ );
        args.push(_.extend(function( err, data ){
          if(err) return next( err );
          dataPatcher ( res, data );
          finalizer   ( req, res, next );
        }, {finish: next.finish}));
        self[method].apply(self, args);
      }

    }
    else return function(req, res, next){
      var args = argumentsGetter.call(self, req, res, _ );
      args.push(function( err, data ){
        if(err) return next( err );
        dataPatcher ( res, data );
        finalizer   ( req, res, next );
      });
      self[method].apply(self, args);
    }
  },

  createDoCaller: function( target, isPartOfChain, path ){
    var self            = this;
    var i               = this.env.i;
    var parts           = target.replace(/([^|])([|])([^|])/g, "$1 $2 $3").split(/[^|][|][^|]/).map( function(part){ return part.trim(); } );
    var address         = parts[0];
    var argumentsGetter = this.createArgumentsGetter( parts[1] );
    var dataPatcher     = this.createDataPatcher( path || parts[2] );
    var finalizer       = this.getFinalizer( isPartOfChain );
    var _               = require("underscore");
    return function(req, res, next){
      var args = argumentsGetter.call(self, req, res, _ );
      args.unshift(address);
      args.push(function( err, data ){
        if(err) return next( err );
        dataPatcher ( res, data );
        finalizer   ( req, res, next );
      });
      i.do.apply(i, args);
    }
  },

  createArgumentsGetter: function( args_string ){
    if(!args_string) return noArguments;
    else return new Function( "req, res, _", "return [" + args_string + "];" );
  },

  createDataPatcher: function( path ){
    if(!path) return dataResultExtender;
    var params = path.match(/\{\w+\}/gi);
    var helpers   = this.env.helpers;
    if(params){
      return function(res, data){
        var new_path = path;
        for(var i = 0; i< params.length; i++){
          new_path = new_path.replace(params[i], data[params[i].replace(/[{}]/g, "")]);
        }
        helpers.patch( res, "data." + new_path, data );
      }
    }
    else{
      return function(res, data){ helpers.patch( res, "data." + path, data ); }
    }
  },

  getFinalizer: function(isPartOfChain){
    return isPartOfChain ? callNext : this.renderer;
  },

  createChain: function(arr, isPartOfChain){
    var self  = this;
    var chain = arr.map(function(target, index){
      var handler = self.parseCall( target, isPartOfChain || ( index < ( arr.length - 1 ) ) );

      if(isPartOfChain || ( index < ( arr.length - 1 ) ) ) {
        return function(req, res, next){
          handler.call(self, req, res, _.extend(function(err){
            if(err) return self.handleError(err, req, res, next);
            next( null, req, res );
          }, {finish: next.finish}));
        }      
      }
      else{
        return function(req, res, next){
          handler.call(self, req, res, function(err){
            if(err) return self.handleError(err, req, res, next);
            next( null, req, res );
          });
        }        
      }

    });

    chain.unshift( createDataNS );
    if(!isPartOfChain) chain.push( self.renderer );

    return this.env.helpers.chain(chain);
  },

  createConcurent: function( obj, isPartOfChain ){
    var self = this;
    var stuff = _.mapObject( obj, function( target, path ){
      return self.parseCall( target, true, path );
    });

    var stuff_chain = this.env.helpers.amapCompose( stuff, null );

    return isPartOfChain ? 

      function(req, res, next){
        res.data = res.data || {};
        stuff_chain(null, function(handler, cb){
          handler.call(self, req, res, cb );
        }, next );
      } : 

      function(req, res, next){
        res.data = res.data || {};
        stuff_chain(null, function(handler, cb){
          handler.call(self, req, res, cb );
        }, function(err){
          if(err) return self.handleError( err, req, res, next );
          self.renderer( req, res );
        });
      }

  },

  render: function(req, res){
    var data   = this.assets(res.data, req, res);
    if(req.session) data.session = req.session;
    data.cache = this.env.helpers.resolve(this.env.config, "views.cache");
    res.render(data.template || this.template, data);
  },

  assets: function(data, req, res){
    data                = data || {};
    data.meta           = _.extend({},this.meta||{},data.meta||{});
    data.javascripts    = _.union(this.javascripts || [], data.javascripts || []);
    data.styles         = _.union(this.styles || [], data.styles || []);
    data.config         = JSON.stringify(_.extend({root:this.root}, this.config, data.config));
    data.title          = data.title || (typeof this.title === "function"?this.title(req, res) : this.title);
    data.page           = this;
    return data;
  }

});

module.exports = Page;
