var should = require('should'),
    Processor = require('../../../lib/deploy.js');

describe('deploy',function(){

    it('should be ok for deploy neitui project',function(done){
        this.timeout(40000);
        new Processor({
            file:__dirname+'/release.conf',
            done:function(){
                done();
            }
        });
    });

});
