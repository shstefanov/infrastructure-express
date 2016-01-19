This is metapackage, containing needed tools for building http-pages structure for application that uses infrastructure framework (https://github.com/shstefanov/infrastructure)

Installation
============

    npm install infrastructure-express

Configuration
=============

    {
      "path": "pages",
      "engines": [
        "infrastructure-express/engine"
      ],

      "config": {

        "session": {
          "secret":             "app.session",
          "collection":         "sessions",
          "clear_interval":     60,
          "cookie": {
            "maxAge":           86400000
          },
          "autoReconnect":      true,
          "stringify":          false,
          "resave":             true,
          "saveUninitialized":  true
        },

        "views":{
          "path":        "templates",
          "view_engine": "jade",
          "cache":       true
        },

        "mongodb": {
          "host":            "localhost",
          "port":            27017,
          "db":              "orbits",
          "auto_reconnect":  true,
          "options":         { "nativeParser": false }
        },

        "http": {
          "port":    3000,
          "favicon": "public/fav.ico",
          "morgan":  ":method :url :status :response-time ms - :res[content-length]",
          "static": {
            "/public":   "public",
            "/locales":  "locales",
            "/vendor/bootstrap":    "node_modules/bootstrap/dist",
            "/vendor/font-awesome": "node_modules/font-awesome/"
          } 
        }

      }

    }

- "path": points to folder (based on project rootDir) where your structure files are located
- "engines": "infrastructure-server-engine-express" (https://github.com/shstefanov/infrastructure-server-engine-express) is required, "infrastructure-server-engine-mongodb" is optional. Keep in mind, that mongodb engine should be initialize first if used.
- "config": Express engine requires "http" configuration as shown above. The only required option is "port". Other options are optional and will activate specific middlewares. "favicon" will activate "serve-favicon" middleware, "morgan" will actiavte "morgan" logger that will log using specified pattern, "static" will activate express.static using key as http path, value as fs path.If mongodb engine is added to engines and config contains configurations for "mongodb" and "session". MongoStore will be activated to keep the sessions in specific mongodb database. "views" is separate config object and tells the engine what view-engine to use, where tempates are located (based on rootDir) and option to use cache. For now, only "jade" is supported.


Usage
=====

In your pages structure directory you need to place files that looks like

    var Page = require("infrastructure-express/Page");
    module.exports = Page.extend("HomePage", {
      root:          "/dashboard",         // Root path that will be prependen to matching url
      template:      "dashboard",          // The template to be rendered (this will point to templates folder -> dashboard.jade)
      title:         "Dashboard - MyApp",  // page title, also it can be function
      // title: function(req, res){ return "Page title"; }

      meta: { // metatags
        "name": "content"
      },

      config: {
        // some config that will be passed to the template (will be stringified)
      },

      // Styles urls that will be provided to template to be rendered
      styles: [
        "/vendor/bootstrap/css/bootstrap.min.css"
      ],

      // Javascripts urls that will be provided to template to be rendered
      javascripts: [],

      // This handler acts as middleware that will be executed before any of matched urls handlers below
      pre: function(req, res, next){
        if( !req.session.logged ) return res.redirect("/auth");
        next();
      },

      // This will match GET request for "/dashboard*""
      // Available methods: GET, POST, PUT, DELETE, ALL
      "GET *" : function(req, res, next){
        // For every request, res.data empty object will be attached;
        // this object will collect any data and finally will be passed to the template
        // render method can be forced by this.render(req, res)
        next();
      },

      // This handler acts as middleware that will be executed after any of matched urls handlers above
      after: function(req, res, next){
        this.render(req, res);
      }

    });


The data, attached to response object, but some properties will e handled and changed before rendering

    {
      "template": "some_template_name", // If provided, this template will be rendered instead of this, set in page class
      "cache": false,    // This property will be always overriden - the value of config.views.cache will be set
      "meta": {},        // Will extend metatags defined in the page class
      "styles": [],      // Styles that will be added to styles, defined in page class
      "javascripts": [], // Styles that will be added to javascripts, defined in page class
      "config": {},      // This will extend config, defined in page class
      "title":           // If provided, will be used instead of title defined in page class
      "page":  page      // page instance itself, in case it holds helpers functions or some dinamic data
      // Everithing else you can attach to res.data in handlers
    }

The Page class have abiity to perform more complex tasks for using as handlers.

    var Page = require("infrastructure-express/Page");
    module.exports = Page.extend("HomePage", {
      root:          "/dashboard",
      template:      "dashboard",
      title:         "Dashboard - MyApp",
      meta: {"name": "content"},
      config: {},
      styles: ["/vendor/bootstrap/css/bootstrap.min.css"],
      javascripts: [],

      pre: function(req, res, next){ if( !req.session.logget ) return res.redirect("/auth"); next(); },

      // This will chain multiple handler, then will render the template
      // When the object is array it will run tasks one by one
      "GET /path_1" : [
        function(req, res, next){ someAsincTask(function(err, result){  res.data.result_1 = result; next(); }); },
        function(req, res, next){ someAsincTask(function(err, result){  res.data.result_2 = result; next(); }); },
        function(req, res, next){ someAsincTask(function(err, result){  res.data.result_3 = result; next(); }); },
      ],

      // If simple string value is set in chain array, it will set data.template to this value
      // Note - do not pass strings, containing dot - they have other role
      "GET /path_2" : [
        function(req, res, next){ someAsincTask(function(err, result){  res.data.result_1 = result; next(); }); },
        "other_templte_name",
        function(req, res, next){ someAsincTask(function(err, result){  res.data.result_2 = result; next(); }); },
        function(req, res, next){ someAsincTask(function(err, result){  res.data.result_3 = result; next(); }); },
      ],

      // If defined as object, tasks will be runned concurently 
      "GET /path_2" : {
        key_1: function(req, res, next){ someAsincTask(function(err, result){  res.data.result_1 = result; next(); }); },
        key_2: "other_templte_name",
        key_3: function(req, res, next){ someAsincTask(function(err, result){  res.data.result_2 = result; next(); }); },
        key_4: function(req, res, next){ someAsincTask(function(err, result){  res.data.result_3 = result; next(); }); },
      },


      // Specil string as handler
      "GET /path_3" : "controller.UsersController.findById | req.session.user_id | "user",
      // The string has 3 parts, separated with |
      // 1 - structure target that will be called
      // 2 - arguments to be passed. Will be produced arguments getter function that gives req, res and _ (underscore as helper) and will return argument values as defined
      // 3 - path, under which result will be mounted on res.data ( can be dot notated )
      // Special handler will be produced for this url, equivalent to:
      // "GET /path_3" : function(req, res, next){
      //   env.i.do("controller.UsersController.findById", req.session.user_id, function(err, user){
      //     if(err) return next(err);
      //     res.data.user = user;
      //     next();
      //   });
      // }

      // And we can combine and nest handlers:
      "GET /path_3" : [
        
        "controller.UsersController.findById | req.session.user_id | "result.user",
        "data.Permissions.find | { user: res.data.result.user._id }, {objectify: ["user"]} | "result.permissions",
        
        function(req, res, next){
          // do something here
          next();
        },

        "#template_name",

        [
          // Some subchain that can contain strings, objects, functions...
        ],

        {
          // In such cases, mountopint is the key of the object
          "result.Posts.number": "data.Pists.find | { author: res.data.result.user._id }, {objectify: ["author"]},
          [ /*  nested array chain, and in array - functions, strings, objects etc... */ ]
        }

      ]

    });

Template engnes
===============

  Jade - uses .jade files as template

    "views":{
      "path":        "templates",
      "view_engine": "jade",
      "cache":       true
    }

  HAML - uses haml files as templates

    "views":{
      "path":        "templates",
      "view_engine": "haml",
      "cache":       true
    }

  HTML - just sends specified html file

    "views":{
      "path":        "templates",
      "view_engine": "html",
      "cache":       true
    }

  Mustache - uses .mustache files as templates

    "views":{
      "path":        "templates",
      "view_engine": "mustache",
      "cache":       true
    }

  Handlebars - uses .hbs files as templates

    "views":{
      "path":        "templates",
      "view_engine": "hbs",
      "cache":       true,
      "options": {
        "layOutsDir":  "path",    //relative to views path folder, default 'layouts'
        "partialsDir": "path",    //relative to views path folder, default 'partials'
        "defaultLayout": "layout_name", //optional
        "compilerOptions": {},      // http://handlebarsjs.com/reference.html

      }
    }

  Hogan

    "views":{
      "path":        "templates",
      "view_engine": "hogan",
      "cache":       true.
      options: {
        "layout": "some_layout", //optional
        "partials": { "foo": "bar" } //optional, https://github.com/vol4ok/hogan-express
      }
    }



Api class
=========

Same as Page, but withous the title, styles, javascripts, metatags, configs. Just renders collected in res.data data as json





Changes
=======

In chains "#template/path.ext" sets or renders template
