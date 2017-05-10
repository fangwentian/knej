/*
 * Html Resource Class
 * @module   meta/html
 * @author   genify(caijf@corp.netease.com)
 */
var path   = require('path'),
    util   = require('util'),
    uglify = require('uglify-js'),
   _io     = require('../util/io.js'),
   _fs     = require('../util/file.js'),
   _util   = require('../util/util.js'),
   _path   = require('../util/path.js');
// resource url handler
var URLHANDLER = {
    rs:function(uri,config){
        // c:/a/b/c.png?a=1
        var arr = uri.split('?'),
            ver = _util.md5(_fs.raw(arr[0]));
        // cache manifest static resource list
        _io.resource(
            arr[0].replace(
                config.webRoot,'/'
            ),ver
        );
        // check version
        if (config.versionStac&&!arr[1]){
            arr[1] = ver;
        }
        // update path
        arr[0] = this._formatURI(arr[0],{
            fromPage:config.fromPage,
            pathRoot:config.output,
            webRoot:config.webRoot,
            domain:config.rsDomain
        });
        return arr.join('?');
    },
    cs:function(uri,config){
        config = _util.merge(config,{
            domain:config.csDomain
        });
        return this._formatRSURI(
            uri,'.css',config
        );
    },
    js:function(uri,config){
        config = _util.merge(config,{
            domain:config.jsDomain
        });
        return this._formatRSURI(
            uri,'.js',config
        );
    },
    sm:function(uri,config){
        return this._formatURI(uri,{
            fromPage:config.fromPage,
            pathRoot:config.output,
            webRoot:config.webRoot
        });
    },
    mf:function(uri,config){
        _io.resource('manifested',!0);
        return this._formatURI(
            config.manOutput,{
                pathRoot:config.output,
                webRoot:config.webRoot,
                domain:config.manRoot
            }
        );
    },
    mdl:function(uri,config){
        uri = uri.replace(
            config.srcRoot,
            config.outHtmlRoot
        );
        return this._formatURI(uri,{
            pathRoot:config.output,
            webRoot:config.webRoot,
            domain:config.mdlRoot
        });
    },
    umi:function(uri,config){
        return 'umi://'+uri.replace(config.mdlSource,'');
    },
    path:function(uri,config){
        return uri.replace(
            config.srcRoot,
            config.outHtmlRoot
        ).replace(
            config.webRoot,'/'
        );
    }
};
// html resource parser
// root             page input root
// isTemplate       is server template file
var Html = module.exports =
    require('../util/klass.js').create();
var pro = Html.extend(require('./resource.js'));
/**
 * class initialization
 * @param  {Object} config - config parameters
 * @return {Void}
 */
pro.init = function(config){
    this._super(config);
    // init config
    config = config||{};
    this._root = config.root;
    this._isTemplate = !!config.isTemplate;
};
/**
 * parse file content with config
 * @protected
 * @param  {String} file    - file path
 * @param  {String} content - file content
 * @param  {Object} config  - config object
 * @return {String} file content after parse
 */
pro._parseContent = function(file,content,config){
    this._super(file,content,config);
    // force adjust path in source input
    config = _util.merge(config,{
        exLinkAttributeFlag:config.
            exLinkAttributeFlag||this._isTemplate
    });
    // parse html
    var parser = new (require('../parser/html.js'))(
        _util.merge(config,{
            file:file,
            content:content
        })
    );
    parser.parse(config);
    return parser;
};
/**
 * dump resource dependency list
 * @param  {Object}  config - config object
 * @param  {String}  config.resType     - resouce type, style or script
 * @param  {Number}  config.listType    - list type for dependency, 0 - all, 1 - only resource list, 2 - resource and template list
 * @param  {Boolean} config.ignoreEntry - whether ignore entry resource
 * @param  {Boolean} config.checkCoreConfig - whether check core config
 * @return {Array}   dependency list
 */
pro.getDependencies = function(config){
    config = config||{};
    // check explorer
    var parser = _io.getFromCache(this._uri),
        resConfig = parser.scriptConfig,
        resExplorer = parser.scripts;
    if (config.resType==='style'){
        resConfig = parser.styleConfig;
        resExplorer = parser.styles;
    }
    if (!resConfig){
        console.error(this._uri);
    }
    // check no core merge
    if (config.checkCoreConfig&&resConfig.core===!1){
        return [];
    }
    var ret = [],
        type = parseInt(config.listType)||0;
    // dump dependency list from style list
    if (!!resExplorer&&(type===0||type===1)){
        ret.push(resExplorer.getDependencies(config));
    }
    // dump dependency list from tempalte list
    parser.nejTemplates.forEach(function(conf){
        var explorer = conf.explorer;
        if (!!explorer&&(type===0||type===2)){
            var list = explorer.getDependencies(config);
            if (type===2&&!!resExplorer){
                var res = resExplorer.getDependencies(config);
                list = _util.split(list,res);
            }
            ret.push(list);
        }
    });
    return _util.concat.apply(_util,ret);
};
/**
 * dump template dependency list
 * @param  {Object} config - config object
 * @return {Void}
 */
pro.getTemplateDependencies = function(config){
    var ret = [],
        parser = _io.getFromCache(this._uri),
        func = function(explorer){
            if (!!explorer){
                ret.push(explorer.getDependencies({
                    resType:'template'
                }));
            }
        };
    // dump dependencies
    func(parser.modules);
    parser.nejTemplates.forEach(function(conf){
        func(conf.explorer);
    });
    return _util.concat.apply(_util,ret);
};
/**
 * parse output style/script name
 * @private
 * @return {Void}
 */
pro._getOutputName = function(){
    // a/b/c.html
    var name = this._uri.replace(this._root,'');
    // a/b/c
    name = name.replace(/\.[^.\/\\]+?$/i,'');
    // a_b_c
    name = name.replace(/\//gi,'_');
    // t_a_b_c
    return util.format(
        '%s_%s',this._isTemplate?'t':'p',name
    );
};
/**
 * get inline source wrapper
 * @private
 * @param  {String} wrap - wrap expression
 * @return {String} wrap expression
 */
pro._getInlineWrapper = function(wrap){
    if (!this._isTemplate){
        return '%s';
    }
    return wrap||'%s';
};
/**
 * get wrapper regexp
 * @private
 * @param  {String} wrap - wrap expression
 * @return {RegExp} wrap expression
 */
pro._getWrapperRegExp = (function(){
    var reg = /<\/(.*?)>/;
    return function(wrap){
        if (reg.test(wrap||'')){
            return new RegExp('<\/('+RegExp.$1+')>','gi');
        }
    };
})();
/**
 * init merge
 * @param  {Object} config - config object
 * @return {Void}
 */
pro.begMerge = function(config){
    // save auto output filename
    var name = this._getOutputName(),
        parser = _io.getFromCache(this._uri);
    [
        parser.styleConfig,
        parser.scriptConfig
    ].forEach(function(conf){
        if (!!conf){
            conf.filename = name;
        }
    });
};
/**
 * merge resource
 * @private
 * @param  {Object} config - config object
 * @return {Array}  file name after merge
 */
pro._mergeResource = function(config){
    config = config||{};
    var parser = _io.getFromCache(this._uri),
        resConfig = parser[config.resConfig],
        res = this.getDependencies({
            resType:config.resType,
            listType:1
        }),
        tpl = this.getDependencies({
            resType:config.resType,
            listType:2
        });
    // split core if need
    if (resConfig.core!==!1){
        [res,tpl].forEach(function(list){
            var ret = _util.split(list,config.core);
            if (ret.length>0){
                resConfig.core = !0;
            }
        });
    }
    // cache css content
    var root = resConfig.filename+config.sufix,
        ret = [];
    if (res.length>0){
        var name = 'p'+root;
        ret.push(name);
        _io.cache(name,_io.fill(res));
        this.emit('debug',{
            data:[name,res],
            message:'%s -> %j'
        });
    }
    if (tpl.length>0){
        var name = 't'+root;
        ret.push(name);
        _io.cache(name,_io.fill(tpl));
        this.emit('debug',{
            data:[name,tpl],
            message:'%s -> %j'
        });
    }
    return ret;
};
/**
 * merge style
 * @param  {Object} config - config object
 * @param  {Array}  config.core - core css list
 * @return {String} css file path
 */
pro.mergeStyle = function(config){
    return this._mergeResource({
        sufix:'.css',
        core:config.core,
        resType:'style',
        resConfig:'styleConfig'
    });
};
/**
 * merge script
 * @param  {Object} config - config object
 * @param  {Array}  config.core - core css list
 * @return {String}
 */
pro.mergeScript = function(config){
    return this._mergeResource({
        sufix:'.js',
        core:config.core,
        resType:'script',
        resConfig:'scriptConfig'
    });
};
/**
 * parse resource before embed
 * @private
 * @param  {Array}  list - resource file list
 * @param  {Object} config - config object
 * @return {Array}  resource embedded list
 */
pro._parseEmbedResource = function(list,config){
    var ret = [],
        max = config.maxSize*1000;
    list.forEach(
        function(name){
            var content = _io.getFromCache(
                name+config.resSuffix
            );
            if (!content){
                return;
            }
            // check core inline
            var inlined = content.length<=max;
            if (name==='core'){
                inlined = !!config.coreInline;
            }
            // inline resource
            if (inlined){
                if (config.resRegexp){
                    content = content.replace(
                        config.resRegexp,'<&#47;$1>'
                    );
                }
                ret.push(util.format(
                    config.resInline,content
                ));
                return;
            }
            // generate link code
            ret.push(util.format(
                config.resExternal,
                _path.wrapURI(config.resType,name)
            ));
        },this
    );
    return ret;
};
/**
 * embed resource to html file
 * @private
 * @param  {Object} config - config object
 * @return {Void}
 */
pro._embedResource = function(config){
    var parser = _io.getFromCache(this._uri),
        pointer = parser[config.resPoint];
    // check style insert point
    if (pointer<0){
        return;
    }
    // check style list
    var ret = [],
        resConfig = parser[
            config.resConfig
        ];
    if (resConfig.core){
        ret.push('core');
    }
    ret.push('p'+resConfig.filename);
    // embed style/script resource
    config = _util.merge(config,{
        coreInline:!!resConfig.inline
    });
    parser.buffer[pointer] = util.format(
        this._getInlineWrapper(config.resWrap),
        this._parseEmbedResource(ret,config).join('\n')
    );
    parser[config.resPoint] = -1;
};
/**
 * embed resource in template
 * @private
 * @param  {Object} config - config object
 * @return {Void}
 */
pro._embedTemplate = function(config){
    config.regRegexp = _util.wrap2reg(
        config.resInline
    );
    var parser = _io.getFromCache(this._uri),
        ret = this._parseEmbedResource(
            ['t'+parser[config.resConfig].filename],config
        );
    if (ret.length>0){
        parser.templateConfig[config.resName] = ret.join('\n');
    }
};
/**
 * embed style to html file
 * @param  {Object} config - config object
 * @param  {Number} config.maxSize       - max inline size
 * @param  {String} config.inlineWrap    - inline template wrapper
 * @param  {String} config.externalWrap  - external template wrapper
 * @param  {String} config.inlineStyle   - inline style wrapper
 * @param  {String} config.externalStyle - external style wrapper
 * @return {Void}
 */
pro.embedStyle = function(config){
    // embed style resource
    this._embedResource({
        maxSize:config.maxSize,
        resType:'cs',
        resPoint:'stylePoint',
        resConfig:'styleConfig',
        resSuffix:'.css',
        resInline:config.inlineStyle,
        resExternal:config.externalStyle
    });
    // embed style template
    this._embedTemplate({
        maxSize:config.maxSize,
        resType:'cs',
        resName:'styles',
        resSuffix:'.css',
        resConfig:'styleConfig',
        resInline:config.inlineWrap,
        resExternal:config.externalWrap
    });
};
/**
 * embed style to html file
 * @param  {Object}  config - config object
 * @param  {Number} config.maxSize        - max inline size
 * @param  {String} config.resWrap        - source wrapper
 * @param  {String} config.inlineWrap     - inline template wrapper
 * @param  {String} config.externalWrap   - external template wrapper
 * @param  {String} config.inlineScript   - inline script wrapper
 * @param  {String} config.externalScript - external script wrapper
 * @return {Void}
 */
pro.embedScript = function(config){
    // embed script resource
    this._embedResource({
        resType:'js',
        resPoint:'scriptPoint',
        resConfig:'scriptConfig',
        resSuffix:'.js',
        resRegexp:/<\/(script)>/gi,
        resInline:config.inlineScript,
        resExternal:config.externalScript,
        resWrap:config.resWrap,
        maxSize:config.maxSize
    });
    // embed script template
    this._embedTemplate({
        maxSize:config.maxSize,
        resType:'js',
        resName:'scripts',
        resSuffix:'.js',
        resConfig:'scriptConfig',
        resInline:config.inlineWrap,
        resExternal:config.externalWrap,
        resRegexp:this._getWrapperRegExp(config.inlineWrap)
    });
};
/**
 * embed merge style/script
 * @param  {Object}  config - config object
 * @param  {Number} config.maxSize        - max inline size
 * @param  {String} config.resWrap        - source wrapper
 * @param  {String} config.inlineScript   - inline script wrapper
 * @param  {String} config.externalScript - external script wrapper
 * @return {Void}
 */
pro.embedResource = function(config){
    var parser = _io.getFromCache(this._uri),
        options = _util.merge(config,{
            resType:'js',
            resSuffix:'.js',
            resRegexp:/<\/(script)>/gi,
            resInline:config.inlineScript,
            resExternal:config.externalScript
        });
    parser.mergeConfig.forEach(function(it,index){
        var name = it.config.name;
        if (!name){
            name = (this._getOutputName()+'_m'+index);
            it.config.name = name;
        }
        var content = _io.fill(it.scripts);
        if (it.config.minify){
            var ret = uglify.minify(content,{
                fromString:!0
            });
            content = ret.code;
        }
        _io.cache(name+options.resSuffix,content);
        parser.buffer[it.pointer] = util.format(
            this._getInlineWrapper(config.resWrap),
            this._parseEmbedResource([name],options).join('\n')
        );
        this.emit('debug',{
            data:[it.scripts],
            message:'merge script -> %j'
        });
    },this);
};
/**
 * embed template to html file
 * @private
 * @param  {Object} config - config object
 * @param  {String} config.resWrap    - source wrapper
 * @param  {String} config.inlineWrap - inline wrapper
 * @return {Void}
 */
pro._inlineTemplate = function(config){
    var parser = _io.getFromCache(this._uri),
        list = parser.nejTemplates;
    // check templates embedded
    if (!list||!list.length){
        return;
    }
    // inline templates
    var conf = parser.templateConfig;
    list.forEach(function(pos){
        var ret = [],
            explorer = pos.explorer;
        // embed text template
        if (!!explorer){
            var content = explorer.stringify({
                resType:'text',
                resWrap:config.inlineWrap
            });
            if (!!content){
                ret.push(content);
            }
        }
        // embed style template
        if (!!conf.styles){
            ret.push(conf.styles);
        }
        // embed script template
        if (!!conf.scripts){
            ret.push(conf.scripts);
        }
        // embed external template
        if (!!explorer){
            var content = explorer.stringify({
                resType:'template'
            });
            if (!!content){
                ret.push(content);
            }
        }
        // inline template
        parser.buffer[pos.pointer] = ret.join('\n');
        //util.format(
        //    this._getInlineWrapper(config.resWrap),
        //    ret.join('\n')
        //);
    });
    // lock template inline
    parser.nejTemplates = [];
};
/**
 * embed template to html file
 * @private
 * @param  {Object} config - config object
 * @param  {String} config.resWrap    - source wrapper
 * @param  {String} config.inlineWrap - inline wrapper
 * @return {Void}
 */
pro._inlineModule = function(config){
    var parser = _io.getFromCache(this._uri);
    if (parser.modulePoint<0){
        return;
    }
    var explorer = parser.modules;
    if (!!explorer){
        var content = explorer.stringify({
            resType:'template',
            resWrap:'<div style="display:none" id="%s">\n%s\n</div>'
        });
        if (!!content){
            parser.buffer[parser.modulePoint] = util.format(
                this._getInlineWrapper(config.resWrap),content
            );
        }
    }
    parser.modulePoint = -1;
};
/**
 * embed template to html file
 * @param  {Object} config - config object
 * @param  {String} config.resWrap    - source wrapper
 * @param  {String} config.inlineWrap - inline wrapper
 * @return {Void}
 */
pro.embedTemplate = function(config){
    this._inlineTemplate(config);
    this._inlineModule(config);
};
/**
 * format resource uri
 * @private
 * @param  {String} uri - uri path
 * @param  {Object}  config - config object
 * @param  {String}  config.pathRoot - file relative to
 * @param  {String}  config.webRoot  - web root path
 * @param  {Array}   config.domain   - domain list
 * @param  {Boolean} config.fromPage - uri from page
 * @return {String} uri after complete
 */
pro._formatURI = function(uri,config){
    // use path relative to webroot for server template
    var domain = config.domain;
    if ((!domain||!domain.length)&&
        config.fromPage!==!1&&
        this._isTemplate){
        domain = ['/'];
    }
    // next domain
    domain = _util.randNext(domain);
    if (!domain){
        // use relative path
        var root = path.dirname(config.pathRoot),
            ret = _path.normalize(
                path.relative(root,uri)
            );
        return (ret.indexOf('.')!==0?'./':'')+ret;
    }
    return uri.replace(
        config.webRoot,domain
    );
};
/**
 * format style/script uri
 * @private
 * @param  {String} name   - file name
 * @param  {String} sufix  - file suffix
 * @param  {String} config - config object
 * @return {String} uri after formatted
 */
pro._formatRSURI = function(name,sufix,config){
    // format content
    var content = this._formatContent(
        _io.getFromCache(name+sufix),
        _util.merge(config,{
            output:config.outStacRoot+name+sufix,
            fromPage:!1
        })
    );
    // calculate file name and version
    var ver = _util.md5(content),
        ret = _util.version(
            config.versionMode,{
                RAND:_util.increment(),
                VERSION:ver,
                FILENAME:name
            }
        );
    // output file
    var file = config.outStacRoot+ret.file+sufix;
    // logger
    this.emit('debug',{
        data:[file],
        message:'output file %s'
    });
    // output
    _io.output(file,content,config.charset);
    _io.resource(file.replace(config.webRoot,'/'),ver);
    // format uri
    var uri = this._formatURI(file,{
        pathRoot:config.output,
        webRoot:config.webRoot,
        domain:config.domain
    });
    return uri+(!ret.version?'':'?')+ret.version;
};
/**
 * format content resource
 * @private
 * @param  {String} content - file content
 * @param  {Object} config  - config object
 * @return {String} content after format
 */
pro._formatContent = function(content,config){
    var self = this;
    return _path.unwrapURI(
        content,function(type,uri){
            var func = URLHANDLER[type];
            if (!!func){
                return func.call(self,uri,config);
            }
            return uri;
        }
    );
};
/**
 * scan buffer to do something with style/script
 * @param  {Function} func  - do something
 * @param  {Object}   scope - function scope
 * @return {Void}
 */
pro.scan = function(callback,scope){
    _io.getFromCache(this._uri).scan(
        callback,scope
    );
};
/**
 * output content
 * @param  {Object} config - config object
 * @param  {String} config.charset     - output file charset
 * @param  {String} config.outHtmlRoot - html output root
 * @param  {String} config.outTmplRoot - template output root
 * @return {Object}
 */
pro.output = function(config){
    var parser = _io.getFromCache(this._uri),
        name = this._isTemplate
             ? 'outTmplRoot' : 'outHtmlRoot',
        file = this._uri.replace(
            this._root,config[name]
        );
    config = _util.merge(config,{
        output:file,
        mdlSource:(parser.moduleConfig||{}).root
    });
    var content = this._formatContent(
        parser.stringify(),config
    );
    _io.cache(file,content);
    return file;
};
