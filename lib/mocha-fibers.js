// A copy of bdd interface, but beforeEach, afterEach, before, after,
// and it methods all run within fibers.

var mocha = require('mocha'),
	bdd = mocha.interfaces.bdd,
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
				fn.call(self, done);
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
module.exports = function(suite) {
	bdd(suite);

	suite.on("pre-require", function(context, file, mocha){
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
