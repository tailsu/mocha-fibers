// A copy of bdd interface, but beforeEach, afterEach, before, after,
// and it methods all run within fibers.

var mocha = require('mocha'),
    Suite = mocha.Suite,
    Test = mocha.Test,
    _ = require('underscore'),
    Fiber = require('fibers'),
    util = require('util');

// Wrap a function in a fiber.  Correctly handles expected presence of
// done callback

//TODO: we're leaking all fibers, because GC'd fibers corrupt the V8 runtime
// http://stackoverflow.com/questions/21407365/fatal-error-inside-v8-during-gc-when-using-node-fibers-in-node-js
var leakedFibers = [];
function fiberize(fn){
  return function(done){

    var self = this;
    var fiber = Fiber(function(){

      try{
        if(fn.length == 1){
          fn.call(self, function(){
            done();
          });
        } else {
          fn.call(self);
          done();
        }
      } catch(e) {
        process.nextTick(function(){
          throw(e);
        });
      }

    });
		leakedFibers.push(fiber);
		fiber.run();
  };
}

// A copy of bdd interface, but wrapping everything in fibers
module.exports = function(suite){
	var suites = [suite];

	suite.on('pre-require', function(context, file, mocha){

		/**
		 * Execute before running tests.
		 */

		context.before = function(fn){
			suites[0].beforeAll(fn);
		};

		/**
		 * Execute after running tests.
		 */

		context.after = function(fn){
			suites[0].afterAll(fn);
		};

		/**
		 * Execute before each test case.
		 */

		context.beforeEach = function(fn){
			suites[0].beforeEach(fn);
		};

		/**
		 * Execute after each test case.
		 */

		context.afterEach = function(fn){
			suites[0].afterEach(fn);
		};

		/**
		 * Describe a "suite" with the given `title`
		 * and callback `fn` containing nested suites
		 * and/or tests.
		 */

		context.describe = context.context = function(title, fn){
			var suite = Suite.create(suites[0], title);
			suites.unshift(suite);
			fn.call(suite);
			suites.shift();
			return suite;
		};

		/**
		 * Pending describe.
		 */

		context.xdescribe =
			context.xcontext =
				context.describe.skip = function(title, fn){
					var suite = Suite.create(suites[0], title);
					suite.pending = true;
					suites.unshift(suite);
					fn.call(suite);
					suites.shift();
				};

		/**
		 * Exclusive suite.
		 */

		context.describe.only = function(title, fn){
			var suite = context.describe(title, fn);
			mocha.grep(suite.fullTitle());
			return suite;
		};

		/**
		 * Describe a specification or test-case
		 * with the given `title` and callback `fn`
		 * acting as a thunk.
		 */

		context.it = context.specify = function(title, fn){
			var suite = suites[0];
			if (suite.pending) var fn = null;
			var test = new Test(title, fn);
			suite.addTest(test);
			return test;
		};

		/**
		 * Exclusive test-case.
		 */

		context.it.only = function(title, fn){
			var test = context.it(title, fn);
			var reString = '^' + utils.escapeRegexp(test.fullTitle()) + '$';
			mocha.grep(new RegExp(reString));
			return test;
		};

		/**
		 * Pending test case.
		 */

		context.xit =
			context.xspecify =
				context.it.skip = function(title){
					context.it(title);
				};

    // Wrap test related methods in fiber
    ['beforeEach', 'afterEach', 'after', 'before', 'it'].forEach(function(method){
      context[method] = _.wrap(context[method], function(fn){
        var args = Array.prototype.slice.call(arguments, 1);
        if(_.isFunction(_.last(args))){
          args.push(fiberize(args.pop()));
        }
        fn.apply(this, args);
      });
    });

  });
};
