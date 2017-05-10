/*
 * HTML Content Tag Parser
 * @module   parser/tag
 * @author   genify(caijf@corp.netease.com)
 */
var util = require('util'),
   _util = require('../util/util.js');
// parser state
var STATE = {
    TEXT        : 1,
    STYLE       : 2,
    SCRIPT      : 3,
    TEXTAREA    : 4,
    NOTMATCH    : 100
};
// state transform handler
var TRANSFORM = {
    style:function(options){
        // begin style
        var attrs = options.attrs||{};
        if (this._state===STATE.TEXT&&
            attrs.disabled==null){
            return STATE.STYLE;
        }
        // end style
        if (this._state===STATE.STYLE&&
            !!options.closed&&!options.selfClosed){
            return 'style';
        }
    },
    script:function(options){
        // begin script
        if (this._state===STATE.TEXT){
            return STATE.SCRIPT;
        }
        // end script
        if (this._state===STATE.SCRIPT&&
            !!options.closed&&!options.selfClosed){
            return 'script';
        }
    },
    textarea:function(options){
        // begin textarea
        if (this._state===STATE.TEXT){
            return STATE.TEXTAREA;
        }
        // end textarea
        if (this._state===STATE.TEXTAREA&&
            !!options.closed&&!options.selfClosed){
            return 'textarea';
        }
    },
    link:function(options){
        var attrs = options.attrs||{};
        // external style link
        if (this._state===STATE.TEXT&&
            !!attrs.href&&attrs.disabled==null){
            // begin style
            this._endTextState();
            this._begResState(STATE.STYLE,options);
            // end style
            this._endResState('style','',options);
            this._begTextState();
            return STATE.NOTMATCH;
        }
    }
};
// tag parser
// input config
// - content          html file content
// supported events
// - onstyle          style resource parse end event, {config:{},buffer:[],source:''}
// - onscript         script resource parse end event, {config:{},buffer:[],source:''}
// - ontextarea       textarea resource parse end event, {config:{},buffer:[],source:''}
// - oninstruction    nej deploy instruction parse end event, {command:'STYLE',config:{core:false},closed:false}
// - ontag            tag parse end event, {tag:{},buffer:[]}
// - ontext           text parse end event, {source:'',buffer:[]}
// - oncomment        comment parse end event, {source:'',buffer:[]}
var Parser = require('../util/klass.js').create();
var pro = Parser.extend(require('../util/event.js'));
/**
 * class initialization
 * @param  {Object} config - config parameters
 * @return {Void}
 */
pro.init = function(config){
    this._super(config);
    config = config||{};
    this._reset();
    new (require('./token.js'))(
        _util.merge(this.getLogger(),{
            content:config.content||'',
            tag:this._onTag.bind(this),
            text:this._onText.bind(this),
            comment:this._onComment.bind(this)
        })
    );
};
/**
 * dump parse result
 * @return {Array} result of content parsed
 */
pro.dump = function(){
    return this._buffer;
};
/**
 * reset internal state
 * @private
 * @return {Void}
 */
pro._reset = function(){
    this._last   = null;
    this._state  = STATE.TEXT;
    this._buffer = [];
    this._string = [];
    this._tagOpt = null;
};
/**
 * check resource state
 * @private
 * @return {Boolean} whether resource state
 */
pro._isInResourceState = function(){
    return this._state==STATE.STYLE||
            this._state==STATE.SCRIPT||
            this._state==STATE.TEXTAREA;
};
/**
 * update state
 * @private
 * @param  {Number} state - state value
 * @return {Void}
 */
pro._updateState = function(state){
    this._last = this._state;
    this._state = state;
};
/**
 * begin text state
 * @private
 * @return {Void}
 */
pro._begTextState = function(){
    this._string = [];
    this._updateState(STATE.TEXT);
};
/**
 * end text state
 * @private
 * @return {Void}
 */
pro._endTextState = function(){
    var text = this._string.join('');
    if (!!text){
        this.emit('text',{
            source:text,
            buffer:this._buffer
        });
    }
};
/**
 * begin resource state
 * @private
 * @param  {Number} state   - state value
 * @param  {Object} options - config options
 * @return {Void}
 */
pro._begResState = function(state,options){
    this._tagOpt = options.attrs;
    this._string = [options.source];
    this._updateState(state);
};
/**
 * end resource state
 * @private
 * @param  {String} name   - resource name
 * @param  {String} source - resource text
 * @return {Void}
 */
pro._endResState = function(name,source,tag){
    var beg = this._string.shift(),
        end = source||'';
    var event = {
        tag:tag,
        config:this._tagOpt,
        buffer:this._buffer,
        source:this._string.join('')
    };
    this.emit(name,event);
    // event.value will be pushed to buffer (for placeholder)
    // if not event.value the origin style will be pushed to buffer
    if (event.value!=null){
        this._buffer.push(event.value);
    }else{
        this._buffer.push(beg,event.source,end);
    }
};
/**
 * parse nej deploy instruction
 * @private
 * @param  {String} comment - comment content
 * @return {Object} instruction config object
 */
pro._parseInstruction = (function(){
    var _eval = function(script){
        var ret = null;
        if (!!script){
            try{
                ret = eval(util.format('(%s)',script));
            }catch(e){
                // ignore
            }
        }
        return ret;
    };
    return function(comment){
        comment = (comment||'').trim();
        // begin instruction
        if (comment.indexOf('@')===0){
            var ret = {closed:!1};
            // @ABC {a:'',b:''}
            var index = comment.search(/[\s\{]/);
            if (index>0){
                ret.command = comment.substr(1,index-1).toUpperCase();
                ret.config = _eval(comment.substr(index));
            }else{
                ret.command = comment.substr(1).toUpperCase();
            }
            return ret;
        }
        // end instruction
        if (comment.indexOf('/@')===0){
            return {
                closed:!0,
                command:comment.substr(2).toUpperCase()
            };
        }
    };
})();
/**
 * on tag event from tokenizer
 * @private
 * @param  {Object} options - tag config
 * @return {Void}
 */
pro._onTag = function(options){
    // script/style/textarea
    var attrs = options.attrs||{},
        tname = options.name.toLowerCase(),
        pfunc = TRANSFORM[tname];
    if (!!pfunc){
        var ret = pfunc.call(this,options);
        // ignore cache
        if (ret===STATE.NOTMATCH){
            return;
        }
        // end state
        if (typeof ret==='string'){
            this._endResState(
                ret,options.source,options
            );
            this._begTextState();
            return;
        }
        // begin state
        if (typeof ret==='number'){
            this._endTextState();
            this._begResState(ret,options);
            return;
        }
    }else{
        var event = {
            tag:options,
            buffer:this._buffer
        };
        this.emit('tag',event);
        if (event.value!=null){
            this._buffer.push(event.value);
            return;
        }
    }
    // save source
    this._onText(options);
};
/**
 * text event from tokenizer
 * @private
 * @param  {Object} options - text config
 * @return {Void}
 */
pro._onText = function(options){
    var event = {
        source:options.source,
        buffer:this._buffer
    };
    // save source
    if (this._isInResourceState()){
        this.emit('restxt',event);
        if (event.value!=null){
            this._string.push(options.value);
        }else{
            this._string.push(options.source);
        }
    }else{
        // text content
        if (!options.name){
            this.emit('text',event);
            if (event.value!=null){
                this._buffer.push(event.value);
                return;
            }
        }
        this._buffer.push(options.source);
    }
};
/**
 * comment event form tokenizer
 * @private
 * @param  {Object} options - comment config
 * @return {Void}
 */
pro._onComment = function(options){
    var ret = this._parseInstruction(options.comment);
    if (!!ret){
        ret.buffer = this._buffer;
        ret.source = options.source;
        this.emit('instruction',ret);
    }else{
        var event = {
            buffer:this._buffer,
            source:options.source
        };
        this.emit('comment',event);
        if (event.value!=null){
            this._buffer.push(event.value);
        }else{
            this._buffer.push(event.source);
        }
    }
};
/**
 * 序列化标签
 * {name:'div',attrs:{a:'aaa',b:'bbbb'},closed:false,selfClosed:false} -> <div a="aaa" b="bbbb">
 * @param  {Object} tag 标签对象
 * @return {String}     序列化后的标签代码
 */
exports.stringify = function(tag){
    // illegal tag object
    if (!tag.name){
        return '';
    }
    var ret = ['<'];
    // close tag
    if (tag.closed){
        ret.push('/');
    }
    ret.push(tag.name);
    // merge properties
    if (!tag.closed){
        var arr = [],
            attrs = tag.attrs||{};
        Object.keys(attrs).forEach(function(key){
            var v = attrs[key];
            if (!!v){
                v = '="'+v+'"';
            }
            arr.push(key+v);
        });
        if (arr.length>0){
            ret.push(' ',arr.join(' '));
        }
        if (tag.selfClosed){
            ret.push('/');
        }
    }
    ret.push('>');
    return ret.join('');
};
// export Parser
exports.Parser = Parser;