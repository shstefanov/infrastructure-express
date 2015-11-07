module.exports = function(cb){
  
  if(!this.config.http) return cb();

  var _              = require("underscore");
  var express        = require('express'                );
  var http           = require('http'                   );
  var path           = require('path'                   );
  var express        = require("express"                );
  var methodOverride = require('method-override'        );
  var bodyParser     = require('body-parser'            );
  var morgan         = require('morgan'                 );
  var fs             = require("fs"                     );

  var env     = this;
  var app     = express();
  var config  = env.config;

  app.set('port',  config.http.port || process.env.HTTP_PORT || 3000);
  app.set('views', path.join(config.rootDir, config.views.path));
  switch(config.views.view_engine){
    case "jade": app.set('view engine', "jade"); break;
    case "haml":
      var hamljs = require("hamljs");
      app.engine('.haml', function(path, options, cb){ hamljs.renderFile(path, "utf8", options, cb); }); 
      app.set('view engine', "hamljs"); break;
    case "html":
      var cache = {};
      app.engine('.html', function(path, options, cb){ 
        cb(null, (config.views.cache && cache[path]) || (cache[path] = fs.readFileSync(path, "utf8")));
      });
      break;
    case "mustache":
      var cache = {}, mustache = require("mustache");
      app.engine('.mustache', function(path, options, cb){ 
        cb(null, mustache.render(cache[path] || (cache[path] = fs.readFileSync(path, "utf8")), options));
      });
      break;
    case "hbs":
      var exphbs  = require('express-handlebars');
      app.engine('hbs', exphbs({
        extname: "hbs",
        layoutsDir:      config.views.path + "/"+((config.views.options || {}).layoutsDir  || 'layouts'  ) + "/",
        partialsDir:     config.views.path + "/"+((config.views.options || {}).partialsDir || 'partials' ) + "/",
        defaultLayout:   (config.views.options || {}).defaultLayout,
        compilerOptions: (config.views.options || {}).compilerOptions
      }));
      app.set('view engine', 'hbs');
      if(config.views.cache) app.enable('view cache');
      break;
    case "hogan":
      app.set ('view engine', 'hogan')    //# use .hogan extension for templates 
      if(config.views.options){
        if(config.options.layout){
          app.set ('layout', config.options.layout); //# use layout.html as the default layout 
        }
        if(config.views.options.partials){
          app.set ('partials', config.views.options.partials);   //# define partials available to all pages 
        }
      }
      if(config.views.cache) app.enable('view cache');
      app.engine('hogan', require('hogan-express'));

  }
  
  
  if(config.http.favicon){
    var favicon = require( 'serve-favicon' );
    app.use(favicon(path.join(config.rootDir, config.http.favicon)));
    env.i.do("log.sys", "favicon", "favicon middleware serves: "+config.http.favicon );
  }

  if(config.http.morgan){
    !Array.isArray(config.morgan)?app.use(morgan(config.http.morgan)):config.http.morgan.forEach(function(opt){app.use(morgan(opt));});
    env.i.do("log.sys", "morgan", "morgan logger running");
  }
  
  app.use(methodOverride());
  app.use(bodyParser.urlencoded({extended: true}));
  app.use(bodyParser.json({extended: true}));
  
  var CookieParser, cookieParser;
  if(config.session){
    CookieParser = require( 'cookie-parser' );
    cookieParser = CookieParser(config.session.secret);
    app.use(cookieParser);
    env.i.do("log.sys", "CookieParser", "Setup cookies ");
  }
  
  var session, sessionStore;
  if(config.session && env.engines.mongodb){
    // https://github.com/expressjs/cookie-session
    var session    = require( 'express-session' );
    var MongoStore = require( 'connect-mongo' )(session);
    sessionStore   = new MongoStore(_.extend({db:env.engines.mongodb}, config.session));
    app.use(session({
      resave:            config.session.resave || true,
      saveUninitialized: config.session.saveUninitialized || true,
      secret:            config.session.secret,
      store:             sessionStore
    }));
    env.i.do("log.sys", "MongoStore", "Collection: "+config.session.collection);
  }
  
  if(config.http.static){
    for(var route in config.http.static){
      var folderPath = path.join(config.rootDir, config.http.static[route]);
      app.use(route, express.static(folderPath));
      env.i.do("log.sys", "http", "Serve static content: "+route+" -> "+folderPath);
    }    
  }
  
  env.engines.express = app;
  var server = http.createServer(app).listen(app.get('port'), function(err){
    if(err) return cb(err);
    env.stops.push(function(cb){ server.close(); cb(); });
    env.i.do("log.sys", "http", 'Express server listening on port ' + app.get('port'));
    cb();
  });

};
