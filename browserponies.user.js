// ==UserScript==
// @name        Derpibooru Browser Ponies
// @namespace   https://derpibooru.org/
// @grant       none
// @include     https://derpibooru.org/*
// @include     https://www.derpibooru.org/*
// @include     https://derpiboo.ru/*
// @include     https://www.derpiboo.ru/*
// @include     https://trixiebooru.org/*
// @include     https://www.trixiebooru.org/*
// @require     https://code.jquery.com/jquery-2.2.4.min.js
// @version     1.0.1
// @description Tag-reactive HTML viewer eenahps for Derpibooru.
// ==/UserScript==

/*
 * Copyright (c) 2011-2013 Mathias Panzenböck
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

"use strict";

if (typeof(BrowserPonies) !== "object") {

// Shims:
(function () {
	var shim = function (obj, shims) {
		for (var name in shims) {
			if (!(name in obj)) {
				obj[name] = shims[name];
			}
		}
	};

	shim(String.prototype, {
		trim: function () {
			return this.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
		},
		trimLeft: function () {
			return this.replace(/^\s\s*/, '');
		},
		trimRight: function () {
			return this.replace(/\s\s*$/, '');
		}
	});

	shim(Array, {
		isArray: function (object) {
			return Object.prototype.toString.call(object) === '[object Array]';
		}
	});

	shim(Array.prototype, {
		indexOf: function (searchElement, fromIndex) {
			if (!fromIndex || fromIndex < 0) fromIndex = 0;
			for (; fromIndex < this.length; ++ fromIndex) {
				if (this[fromIndex] === searchElement) {
					return fromIndex;
				}
			}
			return -1;
		}
	});

	shim(Function.prototype, {
		bind: function (self) {
			var funct   = this;
			var partial = Array.prototype.slice.call(arguments,1);
			return function () {
				return funct.apply(self,partial.concat(Array.prototype.slice.call(arguments)));
			};
		}
	});

	shim(Date, {
		now: function () {
			return new Date().getTime();
		}
	});

	// dummy console object to prevent crashes on forgotten debug messages:
	if (typeof(console) === "undefined")
		shim(window, {console: {}});
	shim(window.console, {log: function () {}});
	shim(window.console, {
		info:  window.console.log,
		warn:  window.console.log,
		error: window.console.log,
		trace: window.console.log,
		dir:   window.console.log
	});
})();

var BrowserPonies = (function () {
	var BaseZIndex = 9000000;
	var observe = document.addEventListener ?
		function (element, event, handler) {
			element.addEventListener(event, handler, false);
		} :
		function (element, event, handler) {
			var wrapper = '_eventHandlingWrapper' in handler ?
				handler._eventHandlingWrapper :
				(handler._eventHandlingWrapper = function () {
					var event = window.event;
					if (!('stopPropagation' in event)) {
						event.stopPropagation = function () {
							this.cancelBubble = true;
						};
					}
					if (!('preventDefault' in event)) {
						event.preventDefault = function() {
							this.returnValue = false;
						};
					}
					if (!('target' in event)) {
						event.target = event.srcElement;
					}
					return handler.call(this,event);
				});
			element.attachEvent('on'+event, wrapper);
		};

	var stopObserving = document.removeEventListener ?
		function (element, event, handler) {
			element.removeEventListener(event, handler, false);
		} :
		function (element, event, handler) {
			if ('_eventHandlingWrapper' in handler) {
				element.detachEvent('on'+event, handler._eventHandlingWrapper);
			}
		};

	var documentHidden = function () {
		var names = ['hidden', 'webkitHidden', 'mozHidden', 'msHidden'];
		for (var i = 0; i < names.length; ++ i) {
			var name = names[i];
			if (name in document) {
				return document[name];
			}
		}
		return false;
	};

	var visibilitychange = function (event) {
		if (timer !== null) {
			if (documentHidden()) {
				clearTimeout(timer);
			}
			else {
				lastTime = Date.now();
				tick();
			}
		}
	};

	if (typeof(document.hidden) !== 'undefined') {
		observe(document, 'visibilitychange', visibilitychange);
	}
	else if (typeof(document.webkitHidden) !== 'undefined') {
		observe(document, 'webkitvisibilitychange', visibilitychange);
	}
	else if (typeof(document.mozHidden) !== 'undefined') {
		observe(document, 'mozvisibilitychange', visibilitychange);
	}
	else if (typeof(document.msHidden) !== 'undefined') {
		observe(document, 'msvisibilitychange', visibilitychange);
	}

	var windowSize = 'innerWidth' in window ?
		function () {
			return {
				width:  window.innerWidth,
				height: window.innerHeight
			};
		} :
		function () {
			return {
				width:  document.documentElement.clientWidth,
				height: document.documentElement.clientHeight
			};
		};

	var padd = function (s,fill,padding,right) {
		if (s.length >= fill) {
			return s;
		}
		padding = new Array(fill-s.length+1).join(padding);
		return right ? (padding + s) : (s + padding);
	};

	var format = function (fmt) {
		var s = '';
		var argind = 1;
		while (fmt) {
			var m = /^([^%]*)%(-)?(0)?(\d+)?(?:\.(\d+)?)?([dfesj%])(.*)$/.exec(fmt);
			if (!m) {
				s += fmt;
				break;
			}
			s += m[1];
			fmt = m[7];

			var right   = m[2] !== '-';
			var fill    = m[4] ? parseInt(m[4]) : 0;
			var decimal = m[5] ? parseInt(m[5]) : 6;
			var padding = right ? (m[3] || ' ') : ' ';

			switch (m[6]) {
				case 'd': s += padd(parseInt(arguments[argind++]).toFixed(0),fill,padding,right); break;
				case 'f': s += padd(Number(arguments[argind++]).toFixed(decimal),fill,padding,right); break;
				case 'e': s += padd(Number(arguments[argind++]).toExponential(decimal),fill,padding,right); break;
				case 's': s += padd(String(arguments[argind++]),fill,' ',right); break;
				case 'j': s += padd(JSON.stringify(arguments[argind++]),fill,' ',right); break;
				case '%': s += padd('%',fill,' ',right);
			}
		}
		return s;
	};
	
	var extend = function (dest, src) {
		for (var name in src) {
			dest[name] = src[name];
		}
		return dest;
	};

	var partial = function (fn) {
		var args = Array.prototype.slice.call(arguments,1);
		return function () {
			return fn.apply(this,args.concat(Array.prototype.slice.call(arguments)));
		};
	};

	var URL = function URL (url) {
		var absurl = URL.abs(url);
		var match = URL.FILE_REGEX.exec(absurl);
		if (!match) match = URL.NET_REGEX.exec(absurl);
		if (!match) {
			throw new URIError("Illegal URL: "+url);
		}
		this.protocol = match[1].toLowerCase();
		this.username = match[2];
		this.password = match[3];
		this.hostname = match[4];
		this.port     = match[5];
		this.pathname = match[6] || "/";
		this.search   = match[7] || "";
		this.hash     = match[8] || "";

		if (!this.port) {
			this.port = URL.DEFAULT_PORTS[this.protocol];
		}
	
		if (this.port && URL.DEFAULT_PORTS[this.protocol] !== this.port) {
			this.host = this.hostname+':'+this.port;
		}
		else {
			this.host = this.hostname;
		}
	};

	URL.prototype = {
		toString: function () {
			return this.protocol+'//'+
				(this.username || this.password ?
					(this.username || 'anonymous')+(this.password ? ':'+this.password : '')+'@' : '')+
				this.hostname+(this.port && R4.URL.DEFAULT_PORTS[this.protocol] !== this.port ? ':'+this.port : '')+
				this.pathname+this.search+this.hash;
		}
	};

	extend(URL, {
		FILE_REGEX: /^(file:)\/\/()()()()([^#\?]*)(\?[^#]*)?(#.*)?$/i,
		NET_REGEX:  /^([a-z][-_a-z0-9]*:)\/\/(?:([^:@\/]*)(?::([^:@\/]*))?@)?([^:@\/]*)(?::(\d+))?(?:(\/[^#\?]*)(\?[^#]*)?(#.*)?)?$/i,
		DEFAULT_PORTS: {
			"http:":   "80",
			"https:": "443",
			"ftp:":    "21",
			"ftps:":  "990",
			"file:":     ""
		},
		abs: function (url, baseurl) {
			if (!baseurl) baseurl = window.location;
			if (url.slice(0,2) === '//') {
				return baseurl.protocol+url;
			}
			else if (url[0] === '/') {
				return baseurl.protocol+'//'+baseurl.host+url;
			}
			else if (url[0] === '#') {
				return baseurl.protocol+'//'+baseurl.host+baseurl.pathname+baseurl.search+url;
			}
			else if (url[0] === '?') {
				return baseurl.protocol+'//'+baseurl.host+baseurl.pathname+url;
			}
			else if ((/^[a-z][-_a-z0-9]*:/i).test(url)) {
				return url;
			}
			else {
				var path = baseurl.pathname.split('/');
				path.pop();
				if (path.length === 0) {
					path.push("");
				}
				path.push(url);
				return baseurl.protocol+'//'+baseurl.host+path.join("/");
			}
		},
		join: function (baseurl) {
			for (var i = 0; i < arguments.length; ++ i) {
				var url = arguments[i];
				
				if ((/^[a-z][-_a-z0-9]*:/i).test(url)) {
					baseurl = url;
				}
				else {
					baseurl = new URL(baseurl);
					if (url.slice(0,2) === '//') {
						baseurl = baseurl.protocol+url;
					}
					else if (url[0] === '/') {
						baseurl = baseurl.protocol+'//'+baseurl.host+url;
					}
					else if (url[0] === '#') {
						baseurl = baseurl.protocol+'//'+baseurl.host+baseurl.pathname+baseurl.search+url;
					}
					else if (url[0] === '?') {
						baseurl = baseurl.protocol+'//'+baseurl.host+baseurl.pathname+url;
					}
					else {
						baseurl = baseurl.protocol+'//'+baseurl.host+baseurl.pathname+url;
					}
				}
			}
			return URL.fix(baseurl);
		},
		fix: function (url) {
			return url.replace(/^https?:\/\/web\d?\.student\.tuwien\.ac\.at\/~e0427417\/browser-ponies\//,"https://panzi.github.com/Browser-Ponies/");
		}
	});

	var Opera = Object.prototype.toString.call(window.opera) === '[object Opera]';
	var IE, IEVersion;
	(function () {
		var m = (/MSIE ([0-9]{1,}[\.0-9]{0,})/).exec(navigator.userAgent);
		IE = !!m;
		if (IE) {
			IEVersion = m[1].split(".");
			for (var i = 0; i < IEVersion.length; ++ i) {
				IEVersion[i] = parseInt(IEVersion[i], 10);
			}
		}
	})();
	var Gecko = navigator.userAgent.indexOf('Gecko') > -1 && navigator.userAgent.indexOf('KHTML') === -1;
	var HasAudio = typeof(Audio) !== "undefined";
	var add = function (element, arg) {
		if (!arg) return;
		if (typeof(arg) === "string") {
			element.appendChild(document.createTextNode(arg));
		}
		else if (Array.isArray(arg)) {
			for (var i = 0, n = arg.length; i < n; ++ i) {
				add(element, arg[i]);
			}
		}
		else if (arg.nodeType === 1 || arg.nodeType === 3) {
			element.appendChild(arg);
		}
		else {
			for (var attr in arg) {
				var value = arg[attr];
				if (attr === "class" || attr === "className") {
					element.className = String(value);
				}
				else if (attr === "for" || attr === "htmlFor") {
					element.htmlFor = String(value);
				}
				else if (/^on/.test(attr)) {
					if (typeof(value) !== "function") {
						throw new Error("Event listeners must be a function.");
					}
					observe(element, attr.replace(/^on/,""), value);
				}
				else if (attr === 'style') {
					if (typeof(value) === "object") {
						for (var name in value) {
							var cssValue = value[name];
							if (name === 'float') {
								element.style.cssFloat   = cssValue;
								element.style.styleFloat = cssValue;
							}
							else if (name === 'opacity') {
								setOpacity(element, Number(cssValue));
							}
							else {
								try {
									element.style[name] = cssValue;
								}
								catch (e) {
									console.error(name+'='+cssValue+' '+e.toString());
								}
							}
						}
					}
					else {
						element.style.cssText += ";"+value;
					}
				}
				else if (attr === 'value' && element.nodeName === 'TEXTAREA') {
					element.value = value;
				}
				else if (value === true) {
					element.setAttribute(attr,attr);
				}
				else if (value === false) {
					element.removeAttribute(attr);
				}
				else {
					element.setAttribute(attr,String(value));
				}
			}
		}
	};

	var setOpacity = IE && IEVersion[0] < 10 ?
		function (element, opacity) {
			try {
				element.style.filter = element.style.filter.replace(/\balpha\([^\)]*\)/gi,'') +
					'alpha(opacity='+(Number(opacity)*100)+')';
			}
			catch (e) {}
			element.style.opacity = opacity;
		} :
		function (element, opacity) {
			element.style.opacity = opacity;
		};

	var tag = function (name) {
		var element = document.createElement(name);
		for (var i = 1, n = arguments.length; i < n; ++ i) {
			add(element, arguments[i]);
		}
		return element;
	};

	var has = function (obj, name) {
		return Object.prototype.hasOwnProperty.call(obj, name);
	};

	var removeAll = function (array, item) {
		for (var i = 0; i < array.length;) {
			if (array[i] === item) {
				array.splice(i,1);
			}
			else {
				++ i;
			}
		}
	};
	
	var dataUrl = function (mimeType, data) {
		return 'data:'+mimeType+';base64,'+Base64.encode(data);
	};

	var escapeXml = function (s) {
		return s.replace(/&/g, '&amp;').replace(
			/</g, '&lt;').replace(/>/g, '&gt;').replace(
			/"/g, '&quot;').replace(/'/g, '&apos;');
	};
	
	// inspired by:
	// http://farhadi.ir/posts/utf8-in-javascript-with-a-new-trick
	var Base64 = {
		encode: function (input) {
			return btoa(unescape(encodeURIComponent(input)));
		},
		decode: function (input) {
			return decodeURIComponent(escape(atob(input)));
		}
	};

	var PonyINI = {
		parse: function (text) {
			var lines = text.split(/\r?\n/);
			var rows = [];
			for (var i = 0, n = lines.length; i < n; ++ i) {
				var line = lines[i].trim();
				if (line.length === 0 || line.charAt(0) === "'")
					continue;
				var row = [];
				line = this.parseLine(line,row);
				if (line.length !== 0) {
					console.error("trailing text:",line);
				}
				rows.push(row);
			}
			return rows;
		},
		parseLine: function (line,row) {
			var pos;
			while ((line = line.trimLeft()).length > 0) {
				var ch = line.charAt(0);
				switch (ch) {
					case '"':
						line = line.slice(1);
						pos = line.search('"');
						if (pos < 0) pos = line.length;
						row.push(line.slice(0,pos));
						line = line.slice(pos);
						if (line.length > 0) {
							ch = line.charAt(0);
							if (ch === '"') {
								line = line.slice(1).trimLeft();
								ch = line.charAt(0);
							}
							if (line.length > 0) {
								if (ch === ',') {
									line = line.slice(1);
								}
								else if (ch !== '}') {
									console.error("data after quoted string:",line);
								}
							}
						}
						else {
							console.error("unterminated quoted string");
						}
						break;

					case ',':
						line = line.slice(1);
						row.push("");
						break;

					case '{':
						var nested = [];
						row.push(nested);
						line = this.parseLine(line.slice(1),nested).trimLeft();
						if (line.length > 0) {
							ch = line.charAt(0);
							if (ch !== '}') {
								console.error("data after list:",line);
							}
							else {
								line = line.slice(1).trimLeft();
								ch = line.charAt(0);
							}

							if (ch === ',') {
								line = line.slice(1);
							}
						}
						else {
							console.error("unterminated list");
						}
						break;

					case '}':
					case '\n':
						return line;

					default:
						pos = line.search(/[,}]/);
						if (pos < 0) pos = line.length;
						row.push(line.slice(0,pos).trim());
						line = line.slice(pos);
						if (line.length > 0) {
							ch = line.charAt(0);
							if (ch === ',') {
								line = line.slice(1);
							}
							else if (ch !== '}') {
								console.error("syntax error:",line);
							}
						}
				}
			}
			return line;
		}
	};

	var parseBoolean = function (value) {
		var s = value.trim().toLowerCase();
		if (s === "true") return true;
		else if (s === "false") return false;
		else throw new Error("illegal boolean value: "+value);
	};

	var parsePoint = function (value) {
		if (typeof(value) === "string")
			value = value.split(",");
		if (value.length !== 2 || !/^\s*-?\d+\s*$/.test(value[0]) || !/^\s*-?\d+\s*$/.test(value[1])) {
			throw new Error("illegal point value: "+value.join(","));
		}
		return {x: parseInt(value[0],10), y: parseInt(value[1],10)};
	};

	var $ = function (element_or_id) {
		if (typeof(element_or_id) === "string") {
			return document.getElementById(element_or_id);
		}
		else if (element_or_id && element_or_id.nodeType === 1) {
			return element_or_id;
		}
		else {
			return null;
		}
	};

	var distance = function (p1, p2) {
		var dx = p2.x - p1.x;
		var dy = p2.y - p1.y;
		return Math.sqrt(dx*dx + dy*dy);
	};

	var randomSelect = function (list) {
		return list[Math.floor(list.length * Math.random())];
	};

	var Movements = {
		Left:      0,
		Right:     1,
		Up:        2,
		Down:      3,
		UpLeft:    4,
		UpRight:   5,
		DownLeft:  6,
		DownRight: 7
	};

	var movementName = function (mov) {
		for (var name in Movements) {
			if (Movements[name] === mov) {
				return name;
			}
		}
		return "Not a Movement";
	};

	var AllowedMoves = {
		None:               0,
		HorizontalOnly:     1,
		VerticalOnly:       2,
		HorizontalVertical: 3,
		DiagonalOnly:       4,
		DiagonalHorizontal: 5,
		DiagonalVertical:   6,
		All:                7,
		MouseOver:          8,
		Sleep:              9,
		Dragged:           10
	};

	var Locations = {
		Top:           0,
		Bottom:        1,
		Left:          2,
		Right:         3,
		BottomRight:   4,
		BottomLeft:    5,
		TopRight:      6,
		TopLeft:       7,
		Center:        8,
		Any:           9,
		AnyNotCenter: 10
	};

	var AudioMimeTypes = {
		wav:  'audio/wav',
		webm: 'audio/webm',
		mpeg: 'audio/mpeg',
		mpga: 'audio/mpeg',
		mpg:  'audio/mpeg',
		mp1:  'audio/mpeg;codecs="mp1"',
		mp2:  'audio/mpeg;codecs="mp2"',
		mp3:  'audio/mpeg;codecs="mp3"',
		mp4:  'audio/mp4',
		mp4a: 'audio/mp4',
		ogg:  'audio/ogg',
		oga:  'audio/ogg',
		flac: 'audio/ogg;codecs="flac"',
		spx:  'audio/ogg;codecs="speex"'
	};

	var locationName = function (loc) {
		for (var name in Locations) {
			if (Locations[name] === loc) {
				return name;
			}
		}
		return "Not a Location";
	};

	var Interaction = function Interaction (interaction) {
		this.name        = interaction.name;
		this.probability = interaction.probability;
		this.proximity   = interaction.proximity === "default" ? 640 : interaction.proximity;
		this.activate    = interaction.activate;
		this.delay       = interaction.delay;
		this.targets     = [];
		this.behaviors   = [];

		for (var i = 0, n = interaction.behaviors.length; i < n; ++ i) {
			this.behaviors.push(interaction.behaviors[i].toLowerCase());
		}

		for (var i = 0, n = interaction.targets.length; i < n; ++ i) {
			var name = interaction.targets[i].toLowerCase();
			if (!has(ponies, name)) {
				console.warn("Interaction "+this.name+" of pony "+interaction.pony+
					" references non-existing pony "+name);
			}
			else {
				var pony = ponies[name];
				for (var j = 0; j < this.behaviors.length;) {
					var behavior = this.behaviors[j];
					if (has(pony.behaviors_by_name, behavior)) {
						 ++ j;
					}
					else {
						this.behaviors.splice(j, 1);
					}
				}
				this.targets.push(pony);
			}
		}
	};

	Interaction.prototype = {
		reachableTargets: function (pos) {
			var targets = [];
			var n = this.targets.length;
			if (n === 0)
				return targets;
			for (var i = 0; i < n; ++ i) {
				var pony = this.targets[i];
				var instance = null;
				var instance_dist = Infinity;
				for (var j = 0, m = pony.instances.length; j < m; ++ j) {
					var inst = pony.instances[j];
					var dist = distance(pos, inst.position());
					if (dist <= this.proximity && dist < instance_dist) {
						instance = inst;
						instance_dist = dist;
					}
				}
				if (instance) {
					targets.push([instance_dist,instance]);
				}
				else if (this.activate === "all") {
					return null;
				}
			}
			if (targets.length === 0) {
				return null;
			}
			if (this.activate === "one") {
				targets.sort(function (lhs,rhs) {
					return lhs[0] - rhs[0];
				});
				return [targets[0][1]];
			}
			else {
				for (var i = 0; i < targets.length; ++ i) {
					targets[i] = targets[i][1];
				}
			}
			return targets;
		}
	};

	var Behavior = function Behavior (baseurl, behavior) {
		extend(this, behavior);

		if (!this.name || this.name.toLowerCase() === 'none') {
			throw new Error(baseurl+': illegal behavior name '+this.name);
		}
		
		if (this.follow) this.follow = this.follow.toLowerCase();
		this.movement = null;
		var movement  = behavior.movement.replace(/[-_\s]/g,'').toLowerCase();

		for (var name in AllowedMoves) {
			if (name.toLowerCase() === movement) {
				this.movement = AllowedMoves[name];
				break;
			}
		}

		if (this.movement === null) {
			throw new Error(baseurl+": illegal movement "+behavior.movement+" for behavior "+behavior.name);
		}

		this.rightsize = {width: 0, height: 0};
		if (behavior.rightimage) {
			this.rightimage = URL.join(baseurl, behavior.rightimage);
		}
		
		this.leftsize = {width: 0, height: 0};
		if (behavior.leftimage) {
			this.leftimage = URL.join(baseurl, behavior.leftimage);
		}

		// XXX: bugfix for ini files: interprete (0, 0) as missing
		if (!this.rightcenter || (this.rightcenter.x === 0 && this.rightcenter.y === 0)) {
			this.rightcenter = {x: 0, y: 0, missing: true};
		}
		
		if (!this.leftcenter || (this.leftcenter.x === 0 && this.leftcenter.y === 0)) {
			this.leftcenter = {x: 0, y: 0, missing: true};
		}

		this.effects         = [];
		this.effects_by_name = {};
		if ('effects' in behavior) {
			for (var i = 0, n = behavior.effects.length; i < n; ++ i) {
				var effect = new Effect(baseurl, behavior.effects[i]);
				this.effects_by_name[effect.name.toLowerCase()] = effect;
				this.effects.push(effect);	
			}
		}
	};

	Behavior.prototype = {
		deref: function (property, pony) {
			var name = this[property];
			var lower_name = (name||'').toLowerCase();
			if (name && lower_name !== 'none') {
				if (has(pony.behaviors_by_name, lower_name)) {
					this[property] = pony.behaviors_by_name[lower_name];
				}
				else {
					console.warn(format("%s: Behavior %s of pony %s references non-existing behavior %s.",
						pony.baseurl, this.name, pony.name, name));
					delete this[property];
				}
			}
			else {
				delete this[property];
			}
		},
		preload: function () {
			for (var i = 0, n = this.effects.length; i < n; ++ i) {
				this.effects[i].preload();
			}

			if (this.rightimage) {
				preloadImage(this.rightimage, function (image) {
					this.rightsize.width  = image.width;
					this.rightsize.height = image.height;
					if (this.rightcenter.missing) {
						this.rightcenter = {
							x: Math.round(image.width  * 0.5),
							y: Math.round(image.height * 0.5)
						};
					}
				}.bind(this));
			}
			
			if (this.leftimage) {
				preloadImage(this.leftimage, function (image) {
					this.leftsize.width  = image.width;
					this.leftsize.height = image.height;
					if (this.leftcenter.missing) {
						this.leftcenter = {
							x: Math.round(image.width  * 0.5),
							y: Math.round(image.height * 0.5)
						};
					}
				}.bind(this));
			}
		},
		isMoving: function () {
			if (this.follow || this.x || this.x) return true;
			switch (this.movement) {
				case AllowedMoves.None:
				case AllowedMoves.MouseOver:
				case AllowedMoves.Sleep:
					return false;
				default:
					return true;
			}
		}
	};

	var parseLocation = function (value) {
		var loc = value.replace(/[-_\s]/g,'').toLowerCase();
		for (var name in Locations) {
			if (name.toLowerCase() === loc) {
				return Locations[name];
			}
		}
		throw new Error('illegal location: '+value);
	};
	
	var Effect = function Effect (baseurl, effect) {
		extend(this, effect);
		this.name = effect.name.toLowerCase();

		var locs = ['rightloc','leftloc','rightcenter','leftcenter'];
		for (var i = 0; i < locs.length; ++ i) {
			var name = locs[i];
			if (name in effect) {
				this[name] = parseLocation(effect[name]);
			}
		}

		this.rightsize = {width: 0, height: 0};
		if (effect.rightimage) {
			this.rightimage = URL.join(baseurl, effect.rightimage);
		}
		this.rightcenter_point = {x: 0, y: 0};
		
		this.leftsize = {width: 0, height: 0};
		if (effect.leftimage) {
			this.leftimage = URL.join(baseurl, effect.leftimage);
		}
		this.leftcenter_point = {x: 0, y: 0};
	};

	Effect.prototype = {
		preload: function () {
			if (this.rightimage) {
				preloadImage(this.rightimage, function (image) {
					this.rightsize.width  = image.width;
					this.rightsize.height = image.height;
					this.rightcenter_point = {
						x: Math.round(image.width  * 0.5),
						y: Math.round(image.height * 0.5)
					};
				}.bind(this));
			}
			
			if (this.leftimage) {
				preloadImage(this.leftimage, function (image) {
					this.leftsize.width  = image.width;
					this.leftsize.height = image.height;
					this.leftcenter_point = {
						x: Math.round(image.width  * 0.5),
						y: Math.round(image.height * 0.5)
					};
				}.bind(this));
			}
		}
	};

	var equalLength = function (s1, s2) {
		var n = Math.min(s1.length, s2.length);
		for (var i = 0; i < n; ++ i) {
			if (s1.charAt(i) !== s2.charAt(i)) {
				return i;
			}
		}
		return n;
	};

	var resources = {};
	var resource_count = 0;
	var resource_loaded_count = 0;
	var onload_callbacks = [];
	var onprogress_callbacks = [];

	var loadImage = function (loader,url,observer) {
		var image = loader.object = new Image();
		observe(image, 'load',  partial(observer,true));
		observe(image, 'error', partial(observer,false));
		observe(image, 'abort', partial(observer,false));
		image.src = url;
	};

	var createAudio = function (urls) {
		var audio = new Audio();
		
		if (typeof(urls) === "string") {
			audio.src = urls;
		}
		else {
			for (var type in urls) {
				var source = tag('source', {src: urls[type]});

				if (type !== "audio/x-unknown") source.type = type;

				audio.appendChild(source);
			}
		}
	
		return audio;
	};
	
	var loadAudio = function (urls) {
		return function (loader,id,observer) {
			var audio = loader.object = createAudio(urls);
			observe(audio, 'loadeddata', partial(observer,true));
			observe(audio, 'error', partial(observer,false));
			observe(audio, 'abort', partial(observer,false));
			audio.preload = 'auto';
		};
	};
	
	var preloadImage = function (url,callback) {
		preload(loadImage,url,callback);
	};
	
	var preloadAudio = function (urls,callback) {
		var fakeurl;
		if (typeof(urls) === "string") {
			fakeurl = urls;
		}
		else {
			var list = [];
			for (var type in urls) {
				list.push(urls[type]);
			}
			if (list.length === 0) {
				throw new Error("no audio url to preload");
			}
			else if (list.length === 1) {
				fakeurl = list[0];
			}
			else {
				var common = list[0];
				for (var i = 1; i < list.length; ++ i) {
					var n = equalLength(common, list[i]);
					if (n !== common.length) {
						common = common.slice(0,n);
					}
				}
				for (var i = 0; i < list.length; ++ i) {
					list[i] = list[i].slice(common.length);
				}
			
				list.sort();
				fakeurl = common+'{'+list.join('|')+'}';
			}
		}

		preload(loadAudio(urls),fakeurl,callback);
	};

	var preload = function (load,url,callback) {
		if (has(resources,url)) {
			if (callback) {
				var loader = resources[url];
				if (loader.loaded) {
					callback(loader.object);
				}
				else {
					loader.callbacks.push(callback);
				}
			}
		}
		else {
			++ resource_count;
			var loader = resources[url] = {
				loaded: false,
				callbacks: callback ? [callback] : []
			};
			
			load(loader, url, function (success) {
				if (loader.loaded) {
					/* EDIT
					console.error('resource loaded twice: '+url); */
					return;
				}
				loader.loaded = true;
				++ resource_loaded_count;
				/* EDIT
				if (success) {
					console.log(format('%3.0f%% %d of %d loaded: %s',
						resource_loaded_count * 100 / resource_count,
						resource_loaded_count, resource_count,
						url));
				}
				else {
					console.error(format('%3.0f%% %d of %d load error: %s',
						resource_loaded_count * 100 / resource_count,
						resource_loaded_count, resource_count,
						url));
				} */
				for (var i = 0, n = onprogress_callbacks.length; i < n; ++ i) {
					onprogress_callbacks[i](resource_loaded_count, resource_count, url, success);
				}
				for (var i = 0, n = loader.callbacks.length; i < n; ++ i) {
					loader.callbacks[i](loader.object, success);
				}
				delete loader.callbacks;
				
				if (resource_loaded_count === resource_count) {
					for (var i = 0, n = onload_callbacks.length; i < n; ++ i) {
						onload_callbacks[i]();
					}
					onload_callbacks = [];
				}
			});
		}
	};
	
	preload(function (loader,url,observer) {
		if (document.body) {
			observer(true);
		}
		else {
			var loaded = false;
			var fireLoad = function () {
				if (!loaded) {
					loaded = true;
					observer(true);
				}
			};

			if (document.addEventListener) {
				// all browsers but IE implement HTML5 DOMContentLoaded
				observe(document, 'DOMContentLoaded', fireLoad);
			}
			else {
				var checkReadyState = function () {
					if (document.readyState === 'complete') {
						stopObserving(document, 'readystatechange', checkReadyState);
						fireLoad();
					}
				};

				observe(document, 'readystatechange', checkReadyState);
			}

			// fallback
			observe(window, 'load', fireLoad);
		}
	}, document.location.href);

	var onload = function (callback) {
		if (resource_loaded_count === resource_count) {
			callback();
		}
		else {
			onload_callbacks.push(callback);
		}
	};

	var onprogress = function (callback) {
		onprogress_callbacks.push(callback);
	};

	var resource_count_for_progress = 0;
	var progressbar = null;
	var insertProgressbar = function () {
		resource_count_for_progress = resource_loaded_count;
		document.body.appendChild(progressbar.container);
		centerProgressbar();
		setTimeout(function () {
			if (progressbar && !progressbar.finished) {
				progressbar.container.style.display = '';
			}
		}, 250);
		observe(window,'resize',centerProgressbar);
		stopObserving(window,'load',insertProgressbar);
	};

	var centerProgressbar = function () {
		var winsize = windowSize();
		var hide = false;
		if (progressbar.container.style.display === "none") {
			hide = true;
			progressbar.container.style.visibility = 'hidden';
			progressbar.container.style.display = '';
		}
		var width  = progressbar.container.offsetWidth;
		var height = progressbar.container.offsetHeight;
		var labelHeight = progressbar.label.offsetHeight;
		if (hide) {
			progressbar.container.style.display = 'none';
			progressbar.container.style.visibility = '';
		}
		progressbar.container.style.left = Math.round((winsize.width  - width)  * 0.5)+'px';
		progressbar.container.style.top  = Math.round((winsize.height - height) * 0.5)+'px';
		progressbar.label.style.top = Math.round((height - labelHeight) * 0.5)+'px';
	};

	onprogress(function (resource_loaded_count, resource_count, url) {
		if (showLoadProgress || progressbar) {
			if (!progressbar) {
				progressbar = {
					bar: tag('div', {style:{
						margin:            '0',
						padding:           '0',
						borderStyle:    'none',
						width:             '0',
						height:         '100%',
						background:  '#9BD6F4',
						MozBorderRadius: '5px',
						borderRadius:    '5px'
					}}),
					label: tag('div', {style:{
						position: 'absolute',
						margin:          '0',
						padding:         '0',
						borderStyle:  'none',
						top:           '0px',
						left:          '0px',
						width:        '100%',
						textAlign:  'center'
					}})
				};
				progressbar.barcontainer = tag('div', {style:{
					margin:            '0',
					padding:           '0',
					borderStyle:    'none',
					width:          '100%',
					height:         '100%',
					background:  '#D8D8D8',
					MozBorderRadius: '5px',
					borderRadius:    '5px'
				}}, progressbar.bar);
				progressbar.container = tag('div', {style:{
					position:      'fixed',
					width:         '450px',
					height:         '30px',
					background:    'white',
					padding:        '10px',
					margin:            '0',
					MozBorderRadius: '5px',
					borderRadius:    '5px',
					color:       '#294256',
					fontWeight:     'bold',
					fontSize:       '16px',
					opacity:         '0.9',
					display:        'none',
					boxShadow:    "2px 2px 12px rgba(0,0,0,0.4)",
					MozBoxShadow: "2px 2px 12px rgba(0,0,0,0.4)"
				}, onclick: function () {
					if (progressbar) {
						progressbar.container.style.display = 'none';
					}
				}}, progressbar.barcontainer, progressbar.label);
			}

			if (progressbar.container.style.display === 'none') {
				resource_count_for_progress = resource_loaded_count;
			}
			
			progressbar.finished = resource_loaded_count === resource_count;

			var loaded = resource_loaded_count - resource_count_for_progress;
			var count = resource_count - resource_count_for_progress;
			var progress = count === 0 ? 1.0 : loaded / count;
			progressbar.bar.style.width = Math.round(progress * 450)+'px';
			progressbar.label.innerHTML = format('Loading Ponies&hellip; %d%%',Math.floor(progress * 100));

			if (!progressbar.container.parentNode) {
				if (document.body) {
					insertProgressbar();
				}
				else {
					observe(window,'load',insertProgressbar);
				}
			}

			if (progressbar.finished) {
				setTimeout(function () {
					stopObserving(window,'resize',centerProgressbar);
					stopObserving(window,'load',insertProgressbar);
					if (progressbar && progressbar.container && progressbar.container.parentNode) {
						progressbar.container.parentNode.removeChild(progressbar.container);
					}
					progressbar = null;
				}, 500);
			}
		}
	});

	var Pony = function Pony (pony) {
		this.baseurl = URL.join(globalBaseUrl, pony.baseurl||"");
		if (!pony.name) {
			throw new Error('pony with following base URL has no name: '+this.baseurl);
		}
		this.name = pony.name;
		this.behaviorgroups      = pony.behaviorgroups || {};
		this.all_behaviors       = [];
		this.random_behaviors    = [];
		this.mouseover_behaviors = [];
		this.dragged_behaviors   = [];
		this.stand_behaviors     = [];
		this.behaviors_by_name   = {};
		this.speeches = [];
		this.random_speeches  = [];
		this.speeches_by_name = {};
		this.interactions = [];
		this.instances    = [];
		this.categories   = [];

		if (pony.categories) {
			for (var i = 0, n = pony.categories.length; i < n; ++ i) {
				this.categories.push(pony.categories[i].toLowerCase());
			}
		}
		
		if (pony.speeches) {
			for (var i = 0, n = pony.speeches.length; i < n; ++ i) {
				var speech = extend({},pony.speeches[i]);
				if (speech.files) {
					var count = 0;
					for (var type in speech.files) {
						speech.files[type] = URL.join(this.baseurl, speech.files[type]);
						++ count;
					}
					if (count === 0) {
						delete speech.files;
					}
				}
				if (speech.name) {
					var lowername = speech.name.toLowerCase();
					if (has(this.speeches_by_name,lowername)) {
						console.warn(format("%s: Speech name %s of pony %s is not unique.",
							this.baseurl, speech.name, pony.name));
					}
					else {
						this.speeches_by_name[lowername] = speech;
					}
				}
				if (!('skip' in speech)) {
					speech.skip = false;
				}
				if (!speech.skip) {
					this.random_speeches.push(speech);
				}
				if ('group' in speech) {
					if (speech.group !== 0 && !has(this.behaviorgroups,speech.group)) {
						/* EDIT
						console.warn(format("%s: Speech %s references unknown behavior group %d.",
							this.baseurl, speech.name, speech.group)); */
					}
				}
				else {
					speech.group = 0;
				}
				this.speeches.push(speech);
			}
		}

		var speakevents = ['speakstart','speakend'];
		if ('behaviors' in pony) {
			for (var i = 0, n = pony.behaviors.length; i < n; ++ i) {
				var behavior = new Behavior(this.baseurl, pony.behaviors[i]);
				var lowername = behavior.name.toLowerCase();
				if (has(this.behaviors_by_name,lowername)) {
					console.warn(format("%s: Behavior name %s of pony %s is not unique.",
						this.baseurl, behavior.name, pony.name));
				}
				else {
					// semantics like Dektop Ponies where the
					// first match is used for linked behaviors
					this.behaviors_by_name[lowername] = behavior;
				}
				for (var j = 0; j < speakevents.length; ++ j) {
					var speakevent = speakevents[j];
					var speechname = behavior[speakevent];
					if (speechname) {
						speechname = speechname.toLowerCase();
						if (has(this.speeches_by_name,speechname)) {
							behavior[speakevent] = this.speeches_by_name[speechname];
						}
						else {
							console.warn(format("%s: Behavior %s of pony %s references non-existing speech %s.",
								this.baseurl, behavior.name, pony.name, behavior[speakevent]));
							delete behavior[speakevent];
						}
					}
				}
				this.all_behaviors.push(behavior);
				if (!('skip' in behavior)) {
					behavior.skip = false;
				}
				if (!behavior.skip) this.random_behaviors.push(behavior);

				switch (behavior.movement) {
					case AllowedMoves.MouseOver:
						this.mouseover_behaviors.push(behavior);
						if (!behavior.skip) this.stand_behaviors.push(behavior);
						break;

					case AllowedMoves.Dragged:
						this.dragged_behaviors.push(behavior);
						if (!behavior.skip) this.stand_behaviors.push(behavior);
						break;

					case AllowedMoves.None:
						if (!behavior.skip) this.stand_behaviors.push(behavior);
						break;
				}
				
				if ('group' in behavior) {
					/* EDIT
					if (behavior.group !== 0 && !has(this.behaviorgroups,behavior.group)) {
						console.warn(format("%s: Behavior %s references unknown behavior group %d.",
							this.baseurl, behavior.name, behavior.group));
					} */
				}
				else {
					behavior.group = 0;
				}
			}

			if (this.dragged_behaviors.length === 0 && this.mouseover_behaviors.length > 0) {
				this.dragged_behaviors = this.mouseover_behaviors.slice();
			}

			if (this.stand_behaviors.length === 0) {
				for (var i = 0, n = this.all_behaviors.length; i < n; ++ i) {
					var behavior = this.all_behaviors[i];
					if (behavior.movement === AllowedMoves.Sleep && !behavior.skip) {
						this.stand_behaviors.push(behavior);
					}
				}
			}

			if (this.stand_behaviors.length === 0) {
				/* EDIT
				console.warn(format("%s: Pony %s has no (non-skip) non-moving behavior.", this.baseurl, this.name)); */
			}
			else if (this.mouseover_behaviors.length === 0) {
				this.mouseover_behaviors = this.stand_behaviors.slice();
			}
			
			// dereference linked behaviors:
			for (var i = 0, n = this.all_behaviors.length; i < n; ++ i) {
				var behavior = this.all_behaviors[i];
				behavior.deref('linked',this);
				behavior.deref('stopped',this);
				behavior.deref('moving',this);
			}
		}
	};

	Pony.prototype = {
		preload: function () {
			for (var i = 0, n = this.all_behaviors.length; i < n; ++ i) {
				this.all_behaviors[i].preload();
			}
			
			if (HasAudio && audioEnabled) {
				for (var i = 0, n = this.speeches.length; i < n; ++ i) {
					var speech = this.speeches[i];
					if (speech.files) {
						preloadAudio(speech.files);
					}
				}
			}
		},
		unspawnAll: function () {
			while (this.instances.length > 0) {
				this.instances[0].unspawn();
			}
		},
		addInteraction: function (interaction) {
			interaction = new Interaction(interaction);

			if (interaction.targets.length === 0) {
				console.warn("Dropping interaction "+interaction.name+" of pony "+this.name+
					" because it has no targets.");
				return false;
			}
			
			for (var i = 0; i < interaction.behaviors.length;) {
				var behavior = interaction.behaviors[i];
				if (has(this.behaviors_by_name, behavior)) {
					 ++ i;
				}
				else {
					interaction.behaviors.splice(i, 1);
				}
			}

			if (interaction.behaviors.length === 0) {
				/* EDIT
				console.warn("Dropping interaction "+interaction.name+" of pony "+this.name+
					" because it has no common behaviors."); */
				return false;
			}

			this.interactions.push(interaction);
			return true;
		}
	};

	var descendantOf = function (child, parent) {
		var node = child.parentNode;
		while (node) {
			if (node === parent) {
				return true;
			}
		}
		return false;
	};
	
	var isOffscreen = function (rect) {
		return isOutsideOf(rect, windowSize());
	};

	// rect has origin at center
	// area is only a size
	var isOutsideOf = function (rect, area) {
		var wh = rect.width  * 0.5;
		var hh = rect.height * 0.5;
		return rect.x < wh || rect.y < hh ||
			rect.x + wh > area.width || 
			rect.y + hh > area.height;
	};

	var clipToScreen = function (rect) {
		var winsize = windowSize();
		var x = rect.x;
		var y = rect.y;
		var wh = rect.width  * 0.5;
		var hh = rect.height * 0.5;

		if (x < wh) {
			x = wh;
		}
		else if (x + wh > winsize.width) {
			x = winsize.width - wh;
		}

		if (y < hh) {
			y = hh;
		}
		else if (y + hh > winsize.height) {
			y = winsize.height - hh;
		}

		return {x: Math.round(x), y: Math.round(y)};
	};

	var Instance = function Instance () {};
	Instance.prototype = {
		setTopLeftPosition: function (pos) {
			this.current_position.x = pos.x + this.current_center.x;
			this.current_position.y = pos.y + this.current_center.y;
			this.img.style.left = Math.round(pos.x)+'px';
			this.img.style.top  = Math.round(pos.y)+'px';
			var zIndex = Math.round(BaseZIndex + pos.y + this.current_size.height);
			if (this.zIndex !== zIndex) {
				this.img.style.zIndex = zIndex;
			}
		},
		setPosition: function (pos) {
			var x = this.current_position.x = pos.x;
			var y = this.current_position.y = pos.y;
			var top = Math.round(y - this.current_center.y);
			this.img.style.left = Math.round(x - this.current_center.x)+'px';
			this.img.style.top  = top+'px';
			var zIndex = Math.round(BaseZIndex + top + this.current_size.height);
			if (this.zIndex !== zIndex) {
				this.img.style.zIndex = zIndex;
			}
		},
		moveBy: function (offset) {
			this.setPosition({
				x: this.current_position.x + offset.x,
				y: this.current_position.y + offset.y
			});
		},
		clipToScreen: function () {
			this.setPosition(clipToScreen(this.rect()));
		},
		topLeftPosition: function () {
			return {
				x: this.current_position.x - this.current_center.x,
				y: this.current_position.y - this.current_center.y
			};
		},
		position: function () {
			return this.current_position;
		},
		size: function () {
			return this.current_size;
		},
		rect: function () {
			// lets abuse for speed (avoid object creation)
			var pos = this.current_position;
			pos.width  = this.current_size.width;
			pos.height = this.current_size.height;
			return pos;

//			var pos  = this.position();
//			var size = this.size();
//			return {
//				x: pos.x,
//				y: pos.y,
//				width:  size.width,
//				height: size.height
//			};
		},
		topLeftRect: function () {
			var pos  = this.topLeftPosition();
			var size = this.size();
			return {
				x: pos.x,
				y: pos.y,
				width:  size.width,
				height: size.height
			};
		},
		isOffscreen: function () {
			return isOffscreen(this.rect());
		}
	};

	var PonyInstance = function PonyInstance (pony) {
		this.pony = pony;
		this.img  = this.createImage();

		this.clear();
	};

	PonyInstance.prototype = extend(new Instance(), {
		createImage: function () {
			var touch = function(evt) {
				evt.preventDefault();
				if (evt.touches.length > 1 || (evt.type === "touchend" && evt.touches.length > 0))
				return;

				var newEvt = document.createEvent("MouseEvents");
				var type = null;
				var touch = null;
				switch (evt.type) {
					case "touchstart":
						type = "mousedown";
						touch = evt.changedTouches[0];
						break;
					case "touchmove":
						type = "mousemove";
						touch = evt.changedTouches[0];
						break;
					case "touchend":
						type = "mouseup";
						touch = evt.changedTouches[0];
						break;
				}
				newEvt.initMouseEvent(type, true, true, evt.target.ownerDocument.defaultView, 1,
					touch.screenX, touch.screenY, touch.clientX, touch.clientY,
					evt.ctrlKey, evt.altKey, evt.shiftKey, evt.metaKey, 0, null);
				evt.target.dispatchEvent(newEvt);
			};
			return tag('img', {
				draggable: 'false',
				style: {
					position:        "fixed",
					userSelect:      "none",
					borderStyle:     "none",
					margin:          "0",
					padding:         "0",
					backgroundColor: "transparent",
					zIndex:          String(BaseZIndex)
				},
				ondragstart: function (event) {
					event.preventDefault();
				},
				ontouchstart: touch,
				ontouchmove: touch,
				ontouchend: touch,
				ondblclick: function () {
					// debug output
					var pos = this.position();
					var duration = (this.end_time - this.start_time) / 1000;
					console.log(
						format('%s does %s%s for %.2f seconds, is at %d x %d and %s. See:',
							this.pony.name, this.current_behavior.name,
							this.current_behavior === this.paint_behavior ? '' :
							' using '+this.paint_behavior.name, duration, pos.x, pos.y,
							(this.following ?
								'follows '+this.following.name() :
								format('wants to go to %d x %d',
									this.dest_position.x, this.dest_position.y))),
						this);
				}.bind(this),
				onmousedown: function (event) {
					// IE 9 supports event.buttons and handles event.button like the w3c says.
					// IE <9 does not support event.buttons but sets event.button to the value
					// event.buttons should have (which is not what the w3c says).
					if ('buttons' in event ? event.buttons & 1 : (IE ? event.button & 1 : event.button === 0)) {
						dragged = this;
						this.mouseover = true;
						// timer === null means paused/not running
						if (timer !== null) {
							this.nextBehavior(true);
						}
						event.preventDefault();
					}
				}.bind(this),
				onmouseover: function () {
					if (!this.mouseover) {
						this.mouseover = true;
						// timer === null means paused/not runnung
						if (timer !== null &&
							!this.isMouseOverOrDragging() &&
							(this.canMouseOver() || this.canDrag())) {
							this.nextBehavior(true);
						}
					}
				}.bind(this),
				onmouseout: function (event) {
					var target = event.target;
					// XXX: the img has no descendants but if it had it might still be correct in case
					//      the relatedTarget is an anchester of the img or any node that is not a child
					//      of img or img itself.
//					if (this.mouseover && (target === this.img || !descendantOf(target, this.img))) {
					if (this.mouseover) {
						this.mouseover = false;
					}
				}.bind(this)
			});
		},
		isMouseOverOrDragging: function () {
			return this.current_behavior &&
				(this.current_behavior.movement === AllowedMoves.MouseOver ||
				 this.current_behavior.movement === AllowedMoves.Dragged);
		},
		canDrag: function () {
			if (!this.current_behavior) {
				return this.pony.dragged_behaviors.length > 0;
			}
			else {
				var current_group = this.current_behavior.group;
				
				for (var i = 0, n = this.pony.dragged_behaviors.length; i < n; ++ i) {
					var behavior = this.pony.dragged_behaviors[i];
					if (behavior.group === 0 || behavior.group === current_group) {
						return true;
					}
				}

				return false;
			}
		},
		canMouseOver: function () {
			if (!this.current_behavior) {
				return this.pony.mouseover_behaviors.length > 0;
			}
			else {
				var current_group = this.current_behavior.group;
				for (var i = 0, n = this.pony.mouseover_behaviors.length; i < n; ++ i) {
					var behavior = this.pony.mouseover_behaviors[i];
					if (behavior.group === 0 || behavior.group === current_group) {
						return true;
					}
				}

				return false;
			}
		},
		name: function () {
			return this.pony.name;
		},
		unspawn: function () {
			var currentTime = Date.now();
			if (this.effects) {
				for (var i = 0, n = this.effects.length; i < n; ++ i) {
					removing.push({
						at: currentTime,
						element: this.effects[i].img
					});
				}
			}
			removing.push({
				at: currentTime,
				element: this.img
			});
			removeAll(this.pony.instances,this);
			removeAll(instances,this);
		},
		clear: function () {
			if (this.effects) {
				for (var i = 0, n = this.effects.length; i < n; ++ i) {
					this.effects[i].clear();
				}
			}
			if (this.img.parentNode) {
				this.img.parentNode.removeChild(this.img);
			}
			this.mouseover           = false;
			this.start_time          = null;
			this.end_time            = null;
			this.current_interaction = null;
			this.interaction_targets = null;
			this.current_imgurl      = null;
			this.interaction_wait    = 0;
			this.current_position    = {x: 0, y: 0};
			this.dest_position       = {x: 0, y: 0};
			this.current_size        = {width: 0, height: 0};
			this.current_center      = {x: 0, y: 0};
			this.zIndex              = BaseZIndex;
			this.current_behavior    = null;
			this.paint_behavior      = null;
			this.facing_right        = true;
			this.end_at_dest         = false;
			this.effects             = [];
			this.repeating           = [];
		},
		interact: function (currentTime,interaction,targets) {
			var pony, behavior = randomSelect(interaction.behaviors);
			this.behave(this.pony.behaviors_by_name[behavior]);
			for (var i = 0, n = targets.length; i < n; ++ i) {
				pony = targets[i];
				pony.behave(pony.pony.behaviors_by_name[behavior]);
				pony.current_interaction = interaction;
			}
			this.current_interaction = interaction;
			this.interaction_targets = targets;
		},
		speak: function (currentTime,speech) {
			if (dontSpeak) return;
			if (speech.text) {
				var duration = Math.max(speech.text.length * 150, 1000);
				var remove = {at: currentTime + duration};
				var text = tag('div',{
					ondblclick: function () {
						remove.at = Date.now();
					},
					style: {
						fontSize:        "14px",
						color:        "#294256",
						background: IE ? "white" : "rgba(255,255,255,0.8)",
						position:       "fixed",
						visibility:    "hidden",
						margin:             "0",
						padding:          "4px",
						maxWidth:       "250px",
						textAlign:     "center",
						borderRadius:    "10px",
						MozBorderRadius: "10px",
						width:           'auto',
						height:          'auto',
						boxShadow:    "2px 2px 12px rgba(0,0,0,0.4)",
						MozBoxShadow: "2px 2px 12px rgba(0,0,0,0.4)",
						zIndex: String(BaseZIndex + 9000)
					}}, speech.text);
				remove.element = text;
				var rect = this.topLeftRect();
				getOverlay().appendChild(text);
				var x = Math.round(rect.x + rect.width * 0.5 - text.offsetWidth * 0.5);
				var y = rect.y + rect.height;
				text.style.left = x+'px';
				text.style.top  = y+'px';
				text.style.visibility = '';
				removing.push(remove);
				text = null;
			}
			if (HasAudio && audioEnabled && speech.files) {
				var audio = createAudio(speech.files);
				audio.volume = volume;
				audio.play();
			}
		},
		update: function (currentTime, passedTime, winsize) {
			var curr = this.rect();
			var dest = null;
			var dist;
			if (this.following) {
				if (this.following.img.parentNode) {
					dest   = this.dest_position;
					dest.x = this.following.current_position.x;

					if (this.following.facing_right) {
						dest.x += this.current_behavior.x - this.following.paint_behavior.rightcenter.x;
//						dest.x += this.current_behavior.x - this.following.paint_behavior.rightcenter.x + 40;
//						dest.x += -this.following.paint_behavior.rightcenter.x + 50;
					}
					else {
						dest.x += -this.current_behavior.x + this.following.paint_behavior.leftcenter.x;
//						dest.x += -this.current_behavior.x + this.following.paint_behavior.leftcenter.x - 20;
//						dest.x += this.following.paint_behavior.leftcenter.x - 30;
					}
					dest.y = this.following.current_position.y + this.current_behavior.y;
					dist = distance(curr, dest);
					if (!this.current_behavior.x && !this.current_behavior.y &&
						dist <= curr.width * 0.5) {
						dest = null;
					}
				}
				else {
					this.following = null;
				}
			}
			else {
				dest = this.dest_position;
				if (dest) dist = distance(curr, dest);
			}

			var pos;
			if (dest) {
				var dx = dest.x - curr.x;
				var dy = dest.y - curr.y;
				var tdist = this.current_behavior.speed * passedTime * 0.01 * globalSpeed;

				if (tdist >= dist) {
					pos = dest;
				}
				else {
					var scale = tdist / dist;
					pos = {
						x: Math.round(curr.x + scale * dx),
						y: Math.round(curr.y + scale * dy)
					};
				}

				if (pos.x !== dest.x) {
					this.setFacingRight(pos.x <= dest.x);
				}
				else if (this.following) {
					if (this.current_behavior.auto_select_images) {
						// TODO: mechanism for selecting behavior for current movement
					}
					else if (Math.round(tdist) === 0) {
						if (this.current_behavior.stopped) {
							this.paint_behavior = this.current_behavior.stopped;
						}
					}
					else {
						if (this.current_behavior.moving) {
							this.paint_behavior = this.current_behavior.moving;
						}
					}
					this.setFacingRight(this.following.facing_right);
				}
				this.setPosition(pos);
/*
				console.log(
					"current: "+curr.x+" x "+curr.y+
					", step: "+pos.x+" x "+pos.y+
					", dest: "+dest.x+" x "+dest.y+
					", dist: "+dist+
					", dist for passed time: "+tdist);
*/
			}
			else {
				pos = curr;
			}

			// update associated effects:
			for (var i = 0; i < this.effects.length;) {
				var effect = this.effects[i];
				if (effect.update(currentTime, passedTime, winsize)) {
					++ i;
				}
				else {
					this.effects.splice(i, 1);
					removing.push({
						element: effect.img,
						at: currentTime
					});
				}
			}
			
			// check if some effects need to be repeated:
			for (var i = 0, n = this.repeating.length; i < n; ++ i) {
				var what = this.repeating[i];
				if (what.at <= currentTime) {
					var inst = new EffectInstance(this, currentTime, what.effect);
					overlay.appendChild(inst.img);
					inst.updatePosition(currentTime, 0);
					this.effects.push(inst);
					what.at += what.effect.delay * 1000;
				}
			}
			
			if (this.interaction_wait <= currentTime &&
					this.pony.interactions.length > 0 &&
					!this.current_interaction) {
				var sumprob = 0;
				var interactions = [];
				var interaction = null;
				for (var i = 0, n = this.pony.interactions.length; i < n; ++ i) {
					interaction = this.pony.interactions[i];
					var targets = interaction.reachableTargets(curr);
					if (targets) {
						sumprob += interaction.probability;
						interactions.push([interaction, targets]);
					}
				}
				
				if (interactions.length > 0) {
					var dice = Math.random() * sumprob;
					var diceiter = 0;
					for (var i = 0, n = interactions.length; i < n; ++ i) {
						interaction = interactions[i];
						diceiter += interaction.probability;
						if (dice <= diceiter) {
							break;
						}
					}

					// The probability is meant for an execution evere 100ms,
					// but I use a configurable interaction interval.
					dice = Math.random() * (100 / interactionInterval);
					if (dice <= interaction[0].probability) {
						this.interact(currentTime,interaction[0],interaction[1]);
						return;
					}
				}

				this.interaction_wait += interactionInterval;
			}

			if (currentTime >= this.end_time ||
				(this.end_at_dest &&
				 this.dest_position.x === pos.x &&
				 this.dest_position.y === pos.y)) {
				this.nextBehavior();
				return;
			}

			if (this.following) return;

			var x1 = this.current_center.x;
			var y1 = this.current_center.y;
			var x2 = this.current_size.width  - x1;
			var y2 = this.current_size.height - y1;
			var left   = pos.x - x1;
			var right  = pos.x + x2;
			var top    = pos.y - y1;
			var bottom = pos.y + y2;

			// bounce of screen edges
			if (left <= 0) {
				if (this.dest_position.x < pos.x) {
					this.dest_position.x = Math.round(Math.max(pos.x + pos.x - this.dest_position.x, x1));
				}
			}
			else if (right >= winsize.width) {
				if (this.dest_position.x > pos.x) {
					this.dest_position.x = Math.round(Math.min(pos.x + pos.x - this.dest_position.x, winsize.width - x2));
				}
			}
			
			if (top <= 0) {
				if (this.dest_position.y < pos.y) {
					this.dest_position.y = Math.round(Math.max(pos.y + pos.y - this.dest_position.y, y1));
				}
			}
			else if (bottom >= winsize.height) {
				if (this.dest_position.y > pos.y) {
					this.dest_position.y = Math.round(Math.min(pos.y + pos.y - this.dest_position.y, winsize.height - y2));
				}
			}
		},
		getNearestInstance: function (name) {
			var nearObjects = [];
			var pos = this.position();
			var pony = ponies[name];
			
			if (!pony) {
				for (var i = 0, n = instances.length; i < n; ++ i) {
					var inst = instances[i];
					if (!this.loops(inst)) {
						for (var j = 0, m = inst.effects.length; j < m; ++ j) {
							var effect = inst.effects[j];
							if (effect.effect.name === name) {
								nearObjects.push([distance(pos, effect.position()), effect]);
							}
						}
					}
				}
			}
			else {
				for (var i = 0, n = pony.instances.length; i < n; ++ i) {
					var inst = pony.instances[i];
					if (!this.loops(inst)) {
						nearObjects.push([distance(pos, inst.position()), inst]);
					}
				}
			}
			
			if (nearObjects.length === 0) {
				return null;
			}
			nearObjects.sort(function (lhs,rhs) { return lhs[0] - rhs[0]; });
			return nearObjects[0][1];
		},
		nextBehavior: function (breaklink) {
			var offscreen = this.isOffscreen();
			if (!breaklink && this.current_behavior && this.current_behavior.linked) {
				this.behave(this.current_behavior.linked, offscreen);
			}
			else {				
				if (this.current_interaction) {
					var currentTime = Date.now();
					this.interaction_wait = currentTime + this.current_interaction.delay * 1000;
					if (this.interaction_targets) {
						// XXX: should I even do this or should I just let the targets do it?
						//      they do it anyway, because current_interaction is also set for them
						//      if it wouldn't be set, they could break out of interactions
						for (var i = 0, n = this.interaction_targets.length; i < n; ++ i) {
							this.interaction_targets[i].interaction_wait = this.interaction_wait;
						}
						this.interaction_targets = null;
					}
					this.current_interaction = null;
				}

				this.behave(this.randomBehavior(offscreen), offscreen);
			}
		},
		setFacingRight: Gecko ?
		function (value) {
			this.facing_right = value;
			var newimg;
			if (value) {
				newimg = this.paint_behavior.rightimage;
				this.current_size   = this.paint_behavior.rightsize;
				this.current_center = this.paint_behavior.rightcenter;
			}
			else {
				newimg = this.paint_behavior.leftimage;
				this.current_size   = this.paint_behavior.leftsize;
				this.current_center = this.paint_behavior.leftcenter;
			}
			if (newimg !== this.current_imgurl) {
				// gif animation bug workaround
				var img = this.createImage();
				img.style.left   = this.img.style.left;
				img.style.top    = this.img.style.top;
				img.style.zIndex = this.img.style.zIndex;
				img.src = this.current_imgurl = newimg;
				this.img.parentNode.replaceChild(img, this.img);
				this.img = img;
			}
		} :
		function (value) {
			this.facing_right = value;
			var newimg;
			if (value) {
				newimg = this.paint_behavior.rightimage;
				this.current_size   = this.paint_behavior.rightsize;
				this.current_center = this.paint_behavior.rightcenter;
			}
			else {
				newimg = this.paint_behavior.leftimage;
				this.current_size   = this.paint_behavior.leftsize;
				this.current_center = this.paint_behavior.leftcenter;
			}
			if (newimg !== this.current_imgurl) {
				this.img.src = this.current_imgurl = newimg;
			}
		},
		behave: function (behavior, moveIntoScreen) {
			this.start_time = Date.now();
			var duration = (behavior.minduration +
				(behavior.maxduration - behavior.minduration) * Math.random());
			this.end_time = this.start_time + duration * 1000;
			var previous_behavior = this.current_behavior;
			this.current_behavior = this.paint_behavior = behavior;

			var neweffects = [];
			for (var i = 0, n = this.effects.length; i < n; ++ i) {
				var inst = this.effects[i];
				if (inst.effect.duration) {
					neweffects.push(inst);
				}
				else {
					removing.push({
						element: inst.img,
						at: this.start_time
					});
				}
			}
			
			// get new image + size
			if (this.facing_right) {
				this.current_size   = this.paint_behavior.rightsize;
				this.current_center = this.paint_behavior.rightcenter;
			}
			else {
				this.current_size   = this.paint_behavior.leftsize;
				this.current_center = this.paint_behavior.leftcenter;
			}
			
			var spoke = false;
			if (previous_behavior && previous_behavior.speakend) {
				this.speak(this.start_time, previous_behavior.speakend);
				spoke = true;
			}

			this.following = null;
			if (behavior.follow) {
				this.following = this.getNearestInstance(behavior.follow);
			}

			if (behavior.speakstart) {
				this.speak(this.start_time, behavior.speakstart);
			}
			else if (!spoke &&
				!this.following &&
				!this.current_interaction) {
				this.speakRandom(this.start_time, speakProbability);
			}
			
			var pos  = this.position();
			var size = this.size();
			var winsize = windowSize();
			this.end_at_dest = false;
			if (this.following) {
				this.dest_position.x = this.following.current_position.x;
				this.dest_position.y = this.following.current_position.y;
			}
			else if (!behavior.follow && (behavior.x || behavior.y)) {
				this.end_at_dest = true;
				this.dest_position = {
					x: Math.round((winsize.width  - size.width)  * (behavior.x || 0) / 100),
					y: Math.round((winsize.height - size.height) * (behavior.y || 0) / 100)
				};
			}
			else {
				// reduce chance of going off-screen
				var movements = null;
				switch (behavior.movement) {
					case AllowedMoves.HorizontalOnly:
						movements = [Movements.Left, Movements.Right];
						break;

					case AllowedMoves.VerticalOnly:
						movements = [Movements.Up, Movements.Down];
						break;

					case AllowedMoves.HorizontalVertical:
						movements = [Movements.Left, Movements.Right,
						             Movements.Up, Movements.Down];
						break;

					case AllowedMoves.DiagonalOnly:
						movements = [Movements.UpLeft, Movements.UpRight,
						             Movements.DownLeft, Movements.DownRight];
						break;

					case AllowedMoves.DiagonalHorizontal:
						movements = [Movements.Left, Movements.Right,
						             Movements.UpLeft, Movements.UpRight,
						             Movements.DownLeft, Movements.DownRight];
						break;

					case AllowedMoves.DiagonalVertical:
						movements = [Movements.Up, Movements.Down,
						             Movements.UpLeft, Movements.UpRight,
						             Movements.DownLeft, Movements.DownRight];
						break;

					case AllowedMoves.All:
						movements = [Movements.Left, Movements.Right,
						             Movements.Up, Movements.Down,
						             Movements.UpLeft, Movements.UpRight,
						             Movements.DownLeft, Movements.DownRight];
						break;
				}

				if (movements === null) {
					this.dest_position.x = Math.round(pos.x);
					this.dest_position.y = Math.round(pos.y);
				}
				else {
					var nearTop    = pos.y - size.height * 0.5 < 100;
					var nearBottom = pos.y + size.height * 0.5 + 100 > winsize.height;
					var nearLeft   = pos.x - size.width * 0.5 < 100;
					var nearRight  = pos.x + size.width * 0.5 + 100 > winsize.width;
					var reducedMovements = movements.slice();

					if (nearTop) {
						removeAll(reducedMovements, Movements.Up);
						removeAll(reducedMovements, Movements.UpLeft);
						removeAll(reducedMovements, Movements.UpRight);
					}
					
					if (nearBottom) {
						removeAll(reducedMovements, Movements.Down);
						removeAll(reducedMovements, Movements.DownLeft);
						removeAll(reducedMovements, Movements.DownRight);
					}
					
					if (nearLeft) {
						removeAll(reducedMovements, Movements.Left);
						removeAll(reducedMovements, Movements.UpLeft);
						removeAll(reducedMovements, Movements.DownLeft);
					}
					
					if (nearRight) {
						removeAll(reducedMovements, Movements.Right);
						removeAll(reducedMovements, Movements.UpRight);
						removeAll(reducedMovements, Movements.DownRight);
					}

					// speed is in pixels/100ms, duration is in sec
					var dist = behavior.speed * duration * 100 * globalSpeed;

					var a;
					switch (randomSelect(reducedMovements.length === 0 ? movements : reducedMovements)) {
						case Movements.Up:
							this.dest_position = {
								x: pos.x,
								y: pos.y - dist
							};
							break;
						case Movements.Down:
							this.dest_position = {
								x: pos.x,
								y: pos.y + dist
							};
							break;
						case Movements.Left:
							this.dest_position = {
								x: pos.x - dist,
								y: pos.y
							};
							break;
						case Movements.Right:
							this.dest_position = {
								x: pos.x + dist,
								y: pos.y
							};
							break;
						case Movements.UpLeft:
							a = Math.sqrt(dist*dist*0.5);
							this.dest_position = {
								x: pos.x - a,
								y: pos.y - a
							};
							break;
						case Movements.UpRight:
							a = Math.sqrt(dist*dist*0.5);
							this.dest_position = {
								x: pos.x + a,
								y: pos.y - a
							};
							break;
						case Movements.DownLeft:
							a = Math.sqrt(dist*dist*0.5);
							this.dest_position = {
								x: pos.x - a,
								y: pos.y + a
							};
							break;
						case Movements.DownRight:
							a = Math.sqrt(dist*dist*0.5);
							this.dest_position = {
								x: pos.x + a,
								y: pos.y + a
							};
							break;
					}

					if (moveIntoScreen) {
						this.dest_position = clipToScreen(extend(this.dest_position, size));
						this.end_at_dest   = true;
					}
					else {
						// clipToScreen already rounds
						this.dest_position.x = Math.round(this.dest_position.x);
						this.dest_position.y = Math.round(this.dest_position.y);
					}
				}
			}

			// this changes the image to the new behavior:
			this.setFacingRight(
				pos.x !== this.dest_position.x ?
				pos.x <= this.dest_position.x :
				this.facing_right);

			// this initializes the new images position:
			// (alternatively maybe this.update(...) could be called?)
			this.setPosition(this.current_position);

			var overlay = getOverlay();
			this.repeating = [];
			for (var i = 0, n = behavior.effects.length; i < n; ++ i) {
				var effect = behavior.effects[i];
				var inst = new EffectInstance(this, this.start_time, effect);
				overlay.appendChild(inst.img);
				inst.updatePosition(this.start_time, 0);
				neweffects.push(inst);

				if (effect.delay) {
					this.repeating.push({
						effect: effect,
						at: this.start_time + effect.delay * 1000
					});
				}
			}
			this.effects = neweffects;
/*
			var msg;
			if (this.following) {
				msg = "following "+behavior.follow;
			}
			else {
				if (this.dest_position.x !== pos.x || this.dest_position.y !== pos.y) {
					msg = "move from "+pos.x+" x "+pos.y+" to "+
						Math.round(this.dest_position.x)+" x "+
						Math.round(this.dest_position.y);
				}
				else {
					msg = "no movement";
				}
				
				if (behavior.follow) {
					msg += " (wanted to follow "+behavior.follow+")";
				}
			}
			console.log(this.pony.name+" does "+behavior.name+": "+msg+" in "+duration+
				" seconds");
*/
		},
		teleport: function () {
			var winsize = windowSize();
			var size = this.size();
			this.setTopLeftPosition({
				x: Math.random() * (winsize.width  - size.width),
				y: Math.random() * (winsize.height - size.height)
			});
		},
		speakRandom: function (start_time, speak_probability) {
			if (Math.random() >= speak_probability) return;
			var filtered = [];
			var current_group = this.current_behavior.group;
			for (var i = 0, n = this.pony.random_speeches.length; i < n; ++ i) {
				var speech = this.pony.random_speeches[i];
				if (speech.group === 0 || speech.group === current_group) {
					filtered.push(speech);
				}
			}
			if (filtered.length > 0) {
				this.speak(start_time, randomSelect(filtered));
			}
		},
		randomBehavior: function (forceMovement) {
			var behaviors;
			var current_group = this.current_behavior ? this.current_behavior.group : 0;
			
			if (this === dragged && this.canDrag()) {
				behaviors = this.pony.dragged_behaviors;
			}
			else if (this.mouseover && this.canMouseOver()) {
				behaviors = this.pony.mouseover_behaviors;
			}
			else {
				behaviors = this.pony.random_behaviors;
			}

			var sumprob = 0;
			var filtered = [];
			for (var i = 0, n = behaviors.length; i < n; ++ i) {
				var behavior = behaviors[i];
				// don't filter looping behaviors because getNearestInstance filteres
				// looping instances and then it just degrades to a standard behavior
				if (forceMovement && !behavior.isMoving()) continue;
				if (current_group !== 0 && behavior.group !== 0 && behavior.group !== current_group) continue;
				sumprob += behavior.probability;
				filtered.push(behavior);
			}
			var dice = Math.random() * sumprob;
			var diceiter = 0;
			for (var i = 0, n = filtered.length; i < n; ++ i) {
				var behavior = filtered[i];
				diceiter += behavior.probability;
				if (dice <= diceiter) {
					return behavior;
				}
			}
			return forceMovement ? this.randomBehavior(false) : null;
		},
		loops: function (instance) {
			while (instance) {
				if (this === instance) return true;
				instance = instance.following;
			}
			return false;
		}
	});

	var EffectInstance = function EffectInstance (pony, start_time, effect) {
		this.pony       = pony;
		this.start_time = start_time;
		var duration = effect.duration * 1000;
		// XXX: Gecko gif animations speed is buggy!
		if (Gecko) duration *= 0.6;
		duration = Math.max(duration - fadeDuration, fadeDuration);
		this.end_time = start_time + duration;
		this.effect   = effect;
		
		var imgurl;
		if (pony.facing_right) {
			imgurl = this.effect.rightimage;
			this.current_size   = this.effect.rightsize;
			this.current_center = this.effect.rightcenter_point;
		}
		else {
			imgurl = this.effect.leftimage;
			this.current_size   = this.effect.leftsize;
			this.current_center = this.effect.leftcenter_point;
		}
		this.current_position = {x: 0, y: 0};
		this.zIndex = BaseZIndex;

		this.current_imgurl = null;
		this.img = this.createImage(imgurl);

		var locs = ['rightloc','rightcenter','leftloc','leftcenter'];
		for (var i = 0, n = locs.length; i < n; ++ i) {
			var name = locs[i];
			var loc = effect[name];

			if (loc === Locations.Any) {
				loc = randomSelect([
					Locations.Top, Locations.Bottom, Locations.Left, Locations.Right,
					Locations.BottomRight, Locations.BottomLeft, Locations.TopRight, Locations.TopLeft,
					Locations.Center
				]);
			}
			else if (loc === Locations.AnyNotCenter) {
				loc = randomSelect([
					Locations.Top, Locations.Bottom, Locations.Left, Locations.Right,
					Locations.BottomRight, Locations.BottomLeft, Locations.TopRight, Locations.TopLeft
				]);
			}

			this[name] = loc;
		}
	};

	EffectInstance.prototype = extend(new Instance(), {
		createImage: function (src) {
			var img = tag(Gecko || Opera ? 'img' : 'iframe', {
				src: src,
				draggable: 'false',
				style: {
					position:        "fixed",
					overflow:        "hidden",
					userSelect:      "none",
					pointerEvents:   "none",
					borderStyle:     "none",
					margin:          "0",
						padding:         "0",
					backgroundColor: "transparent",
					width:           this.current_size.width+"px",
					height:          this.current_size.height+"px",
					zIndex:          String(BaseZIndex)
				}});
			if (IE) {
				img.setAttribute("scrolling",   "no");
				img.setAttribute("frameborder",  "0");
				img.setAttribute("marginheight", "0");
				img.setAttribute("marginwidth",  "0");
			}
			return img;
		},
		name: function () {
			return this.effect.name;
		},
		clear: function () {
			if (this.img.parentNode) {
				this.img.parentNode.removeChild(this.img);
			}
		},
		updatePosition: function (currentTime, passedTime) {
			var loc, center;
			if (this.pony.facing_right) {
				loc = this.rightloc;
				center = this.rightcenter;
			}
			else {
				loc = this.leftloc;
				center = this.leftcenter;
			}

			var size = this.size();
			var pos;

			switch (center) {
				case Locations.Top:
					pos = {x: -size.width * 0.5, y: 0};
					break;
				case Locations.Bottom:
					pos = {x: -size.width * 0.5, y: -size.height};
					break;
				case Locations.Left:
					pos = {x: 0, y: -size.height * 0.5};
					break;
				case Locations.Right:
					pos = {x: -size.width, y: -size.height * 0.5};
					break;
				case Locations.BottomRight:
					pos = {x: -size.width, y: -size.height};
					break;
				case Locations.BottomLeft:
					pos = {x: 0, y: -size.height};
					break;
				case Locations.TopRight:
					pos = {x: -size.width, y: 0};
					break;
				case Locations.TopLeft:
					pos = {x: 0, y: 0};
					break;
				case Locations.Center:
					pos = {x: -size.width * 0.5, y: -size.height * 0.5};
					break;
			}
			
			var ponyRect = this.pony.topLeftRect();
			switch (loc) {
				case Locations.Top:
					pos.x += ponyRect.x + ponyRect.width * 0.5;
					pos.y += ponyRect.y;
					break;
				case Locations.Bottom:
					pos.x += ponyRect.x + ponyRect.width * 0.5;
					pos.y += ponyRect.y + ponyRect.height;
					break;
				case Locations.Left:
					pos.x += ponyRect.x;
					pos.y += ponyRect.y + ponyRect.height * 0.5;
					break;
				case Locations.Right:
					pos.x += ponyRect.x + ponyRect.width;
					pos.y += ponyRect.y + ponyRect.height * 0.5;
					break;
				case Locations.BottomRight:
					pos.x += ponyRect.x + ponyRect.width;
					pos.y += ponyRect.y + ponyRect.height;
					break;
				case Locations.BottomLeft:
					pos.x += ponyRect.x;
					pos.y += ponyRect.y + ponyRect.height;
					break;
				case Locations.TopRight:
					pos.x += ponyRect.x + ponyRect.width;
					pos.y += ponyRect.y;
					break;
				case Locations.TopLeft:
					pos.x += ponyRect.x;
					pos.y += ponyRect.y;
					break;
				case Locations.Center:
					pos.x += ponyRect.x + ponyRect.width  * 0.5;
					pos.y += ponyRect.y + ponyRect.height * 0.5;
					break;
			}

			this.setTopLeftPosition(pos);
		},
		/*
		setImage: function (url) {
			if (this.current_imgurl !== url) {
				this.img.src = dataUrl('text/html',
					'<html><head><title>'+Math.random()+
					'</title><style text="text/css">html,body{margin:0;padding:0;background:transparent;}</style><body></body><img src="'+
					escapeXml(URL.abs(url))+'"/></html>');
				this.img.style.width  = this.current_size.width+"px";
				this.img.style.height = this.current_size.height+"px";
				this.current_imgurl = url;
			}
		},
		*/
		setImage: Gecko ?
		function (url) {
			if (this.current_imgurl !== url) {
				// gif animation bug workaround
				var img = this.createImage(url);
				img.style.left   = this.img.style.left;
				img.style.top    = this.img.style.top;
				img.style.zIndex = this.img.style.zIndex;
				this.current_imgurl = url;
				this.img.parentNode.replaceChild(img, this.img);
				this.img = img;
			}
		} :
		function (url) {
			if (this.current_imgurl !== url) {
				this.img.src = this.current_imgurl = url;
				this.img.style.width  = this.current_size.width+"px";
				this.img.style.height = this.current_size.height+"px";
			}
		},
		update: function (currentTime, passedTime, winsize) {
			if (this.effect.follow) {
				this.updatePosition(currentTime, passedTime);
				
				var imgurl;
				if (this.pony.facing_right) {
					imgurl = this.effect.rightimage;
					this.current_size   = this.effect.rightsize;
					this.current_center = this.effect.rightcenter_point;
				}
				else {
					imgurl = this.effect.leftimage;
					this.current_size   = this.effect.leftsize;
					this.current_center = this.effect.leftcenter_point;
				}
				this.setImage(imgurl);
			}
			return !this.effect.duration || currentTime < this.end_time;
		}
	});

	var lastTime = Date.now();
	var tick = function () {
		if (timer === null) return;
		var currentTime = Date.now();
		var timeSpan = currentTime - lastTime;
		var winsize = windowSize();
		
		for (var i = 0, n = instances.length; i < n; ++ i) {
			instances[i].update(currentTime, timeSpan, winsize);
		}

		// check if something needs to be removed:
		for (var i = 0; i < removing.length;) {
			var what = removing[i];
			if (what.at + fadeDuration <= currentTime) {
				if (what.element.parentNode) {
					what.element.parentNode.removeChild(what.element);
				}
				removing.splice(i, 1);
			}
			else {
				if (what.at <= currentTime) {
					setOpacity(what.element, 1 - (currentTime - what.at) / fadeDuration);
				}
				++ i;
			}
		}

		if (showFps) {
			if (!fpsDisplay) {
				var overlay = getOverlay();
				fpsDisplay = tag('div', {style: {
					fontSize:  '18px',
					position: 'fixed',
					bottom:       '0',
					left:         '0',
					zIndex: String(BaseZIndex + 9001)
				}});
				overlay.appendChild(fpsDisplay);
			}

			fpsDisplay.innerHTML = Math.round(1000 / timeSpan) + ' fps';
		}

		timer = setTimeout(tick, Math.max(interval - (currentTime - Date.now()), 0));

		lastTime = currentTime;
	};

	var fadeDuration = 500;
	var preloadAll = false;
	var showLoadProgress = true;
	var audioEnabled = false;
	var showFps = false;
	var globalBaseUrl = URL.abs('');
	var globalSpeed = 3; // why is it too slow otherwise?
	var speakProbability = 0.1;
	var dontSpeak = false;
	var interval = 40;
	var interactionInterval = 500;
	var ponies = {};
	var instances = [];
	var removing = [];
	var overlay = null;
	var timer = null;
	var mousePosition = null;
	var dragged = null;
	var fpsDisplay = null;
	var volume = 1.0;

	var getOverlay = function () {
		if (!overlay) {
			overlay = tag('div', {id: 'browser-ponies'});
		}
		if (!overlay.parentNode) {
			document.body.appendChild(overlay);
		}
		return overlay;
	};

	observe(document, 'touchstart', function (event) {
		mousePosition = null;
	});
	observe(document, 'mousemove', function (event) {
		if (!mousePosition) {
			mousePosition = {
				x: event.clientX,
				y: event.clientY
			};
		}
		if (dragged) {
			dragged.moveBy({
				x: event.clientX - mousePosition.x,
				y: event.clientY - mousePosition.y
			});
			extend(dragged.dest_position, dragged.current_position);
			event.preventDefault();
		}
		mousePosition.x = event.clientX;
		mousePosition.y = event.clientY;
	});
	
	observe(document, 'mouseup', function () {
		if (dragged) {
			var inst = dragged;
			dragged = null;
			if (timer !== null) {
				inst.nextBehavior();
			}
		}
	});
	
	return {
		convertPony: function (ini, baseurl) {
			var rows = PonyINI.parse(ini);
			var pony = {
				baseurl:    baseurl || "",
				behaviorgroups: {},
				behaviors:  [],
				speeches:   [],
				categories: []
			};
			var behaviors_by_name = {};
			var effects = [];

			for (var i = 0, n = rows.length; i < n; ++ i) {
				var row = rows[i];
				var type = row[0].toLowerCase();

				switch (type) {
					case "name":
						pony.name = row[1];
						break;
					
					case "behaviorgroup":
						var group = parseInt(row[1],10);
						if (isNaN(group)) {
							console.warn(baseurl+': illegal behavior group id: ',row[1]);
						}
						else {
							pony.behaviorgroups[group] = row[2];
						}
						break;

					case "behavior":
						var behavior = {
							name: row[1],
							probability: Number(row[2]),
							maxduration: Number(row[3]),
							minduration: Number(row[4]),
							speed:       Number(row[5]),
							rightimage:  encodeURIComponent(row[6]),
							leftimage:   encodeURIComponent(row[7]),
							movement:    row[8],
							effects:     [],
							auto_select_images:    true,
							dont_repeat_animation: false // XXX: cannot be supported by JavaScript
						};
						if (row.length > 9) {
							if (row[9]) behavior.linked = row[9];
							var speakstart = (row[10] || '').trim();
							if (speakstart) behavior.speakstart = speakstart;
							var speakend = (row[11] || '').trim();
							if (speakend)   behavior.speakend   = speakend;
							behavior.skip = parseBoolean(row[12]);
							behavior.x    = Number(row[13]);
							behavior.y    = Number(row[14]);
							if (row[15]) behavior.follow = row[15];

							if (row.length > 16) {
								behavior.auto_select_images = parseBoolean(row[16]);
								if (row[17]) behavior.stopped = row[17];
								if (row[18]) behavior.moving  = row[18];

								if (row.length > 19) {
									behavior.rightcenter = parsePoint(row[19]);
									behavior.leftcenter  = parsePoint(row[20]);

									if (row.length > 21) {
										behavior.dont_repeat_animation = parseBoolean(row[21]);
										/* EDIT
										if (behavior.dont_repeat_animation) {
											console.warn(baseurl+': behavior '+behavior.name+
												' sets dont_repeat_animation to true, which is not supported by Browser Ponies due to limitations in browsers. '+
												'Please use a GIF that does not loop instead.');
										} */
										if (row[22]) {
											behavior.group = parseInt(row[22],10);
											if (isNaN(behavior.group)) {
												delete behavior.group;
												/* EDIT
												console.warn(baseurl+': behavior '+behavior.name+
													' references illegal behavior group id: ',row[22]); */
											}
										}
									}
								}
							}
						}
						pony.behaviors.push(behavior);
						behaviors_by_name[behavior.name.toLowerCase()] = behavior;
						break;
						
					case "effect":
						var effect = {
							name:        row[1],
							behavior:    row[2],
							rightimage:  encodeURIComponent(row[3]),
							leftimage:   encodeURIComponent(row[4]),
							duration:    Number(row[5]),
							delay:       Number(row[6]),
							rightloc:    row[7].trim(),
							rightcenter: row[8].trim(),
							leftloc:     row[9].trim(),
							leftcenter:  row[10].trim(),
							follow:      parseBoolean(row[11]),
							dont_repeat_animation: row[12] ? parseBoolean(row[12]) : false // XXX: cannot be supported by JavaScript
						};
						/* EDIT
						if (effect.dont_repeat_animation) {
							console.warn(baseurl+': effect '+effect.name+
								' sets dont_repeat_animation to true, which is not supported by Browser Ponies due to limitations in browsers. '+
								'Please use a GIF that does not loop instead.');
						} */
						effects.push(effect);
						break;
						
					case "speak":
						var speak;
						if (row.length === 2) {
							speak = {
								text: row[1]
							};
						}
						else {
							speak = {
								name: row[1],
								text: row[2].trim()
							};
							if (row[4]) speak.skip  = parseBoolean(row[4]);
							if (row[5]) speak.group = parseInt(row[5],10);
							var files = row[3];
							if (files) {
								if (!Array.isArray(files)) files = [files];
								if (files.length > 0) {
									speak.files = {};
									for (var j = 0; j < files.length; ++ j) {
										var file = files[j];
										var ext = /(?:\.([^\.]*))?$/.exec(file)[1];
										var filetype;
										if (ext) {
											ext = ext.toLowerCase();
											filetype = AudioMimeTypes[ext] || 'audio/x-'+ext;
										}
										else {
											filetype = 'audio/x-unknown';
										}
										if (filetype in speak.files) {
											console.warn(baseurl+': file type '+filetype+
												' of speak line '+speak.name+
												' is not unique.');
										}
										speak.files[filetype] = encodeURIComponent(file);
									}
								}
							}
							if ('group' in speak && isNaN(speak.group)) {
								delete speak.group;
								console.warn(baseurl+': speak line '+speak.name+
									' references illegal behavior group id: ',row[5]);
							}
						}
						pony.speeches.push(speak);
						break;

					case "categories":
						pony.categories = pony.categories.concat(row.slice(1));
						break;

					default:
						console.warn(baseurl+": Unknown pony setting:",row);
				}
			}
			
			if (!('name' in pony)) {
				throw new Error('Pony with following base URL has no name: '+pony.baseurl);
			}

			for (var i = 0, n = effects.length; i < n; ++ i) {
				var effect = effects[i];
				var behavior = effect.behavior.toLowerCase();
				if (!has(behaviors_by_name,behavior)) {
					console.warn(baseurl+": Effect "+effect.name+" of pony "+pony.name+
						" references non-existing behavior "+effect.behavior);
				}
				else {
					behaviors_by_name[behavior].effects.push(effect);
					delete effect.behavior;
				}
			}

			for (var name in behaviors_by_name) {
				var behavior = behaviors_by_name[name];
				if (behavior.effects.length === 0) {
					delete behavior.effects;
				}
			}

			var has_behaviorgroups = false;
			for (var behaviorgroup in pony.behaviorgroups) {
				has_behaviorgroups = true;
				break;
			}

			if (!has_behaviorgroups) {
				delete pony.behaviorgroups;
			}

			return pony;
		},
		convertInteractions: function (ini) {
			var rows = PonyINI.parse(ini);
			var interactions = [];

			for (var i = 0, n = rows.length; i < n; ++ i) {
				var row = rows[i];
				var activate = "one";
				if (row.length > 4) {
					activate = row[5].trim().toLowerCase();
					if (activate === "true" || activate === "all") {
						activate = "all";
					}
					else if (activate == "random" || activate === "any") {
						activate = "any";
					}
					else if (activate === "false" || activate === "one") {
						activate = "one";
					}
					else {
						throw new Error("illegal target activation value: "+row[5]);
					}
				}

				var proximity = row[3].trim().toLowerCase();
				if (proximity !== "default") proximity = Number(proximity);
				interactions.push({
					name:        row[0],
					pony:        row[1],
					probability: Number(row[2]),
					proximity:   proximity,
					targets:     row[4],
					activate:    activate,
					behaviors:   row[6],
					delay:       row.length > 7 ? Number(row[7].trim()) : 0
				});
			}

			return interactions;
		},
		addInteractions: function (interactions) {
			if (typeof(interactions) === "string") {
				interactions = this.convertInteractions(interactions);
			}
			for (var i = 0, n = interactions.length; i < n; ++ i) {
				this.addInteraction(interactions[i]);
			}
		},
		addInteraction: function (interaction) {
			var lowername = interaction.pony.toLowerCase();
			if (!has(ponies,lowername)) {
				console.error("No such pony:",interaction.pony);
				return false;
			}
			return ponies[lowername].addInteraction(interaction);
		},
		addPonies: function (ponies) {
			for (var i = 0, n = ponies.length; i < n; ++ i) {
				this.addPony(ponies[i]);
			}
		},
		addPony: function (pony) {
			if (pony.ini) {
				pony = this.convertPony(pony.ini, pony.baseurl);
			}
			if (pony.behaviors.length === 0) {
				console.error("Pony "+pony.name+" has no behaviors.");
				return false;
			}
			var lowername = pony.name.toLowerCase();
			if (has(ponies,lowername)) {
				// EDIT: this isn't really error-worthy
				//~ console.error("Pony "+pony.name+" already exists.");
				return false;
			}
			ponies[lowername] = new Pony(pony);
			return true;
		},
		removePonies: function (ponies) {
			for (var i = 0, n = ponies.length; i < n; ++ i) {
				this.removePony(ponies[i]);
			}
		},
		removePony: function (name) {
			var lowername = name.toLowerCase();
			if (has(ponies,lowername)) {
				ponies[lowername].unspawnAll();
				delete ponies[lowername];
			}
		},
		spawnRandom: function (count) {
			if (count === undefined) count = 1;
			else count = parseInt(count);

			if (isNaN(count)) {
				console.error("unexpected NaN value");
				return [];
			}

			var spawned = [];
			while (count > 0) {
				var mininstcount = Infinity;

				for (var name in ponies) {
					var instcount = ponies[name].instances.length;
					if (instcount < mininstcount) {
						mininstcount = instcount;
					}
				}

				if (mininstcount === Infinity) {
					console.error("can't spawn random ponies because there are no ponies loaded");
					break;
				}

				var names = [];
				for (var name in ponies) {
					if (ponies[name].instances.length === mininstcount) {
						names.push(name);
					}
				}

				var name = randomSelect(names);

				if (this.spawn(name)) {
					spawned.push(name);
				}
				-- count;
			}
			return spawned;
		},
		spawn: function (name, count) {
			var lowername = name.toLowerCase();
			if (!has(ponies,lowername)) {
				console.error("No such pony:",name);
				return false;
			}
			var pony = ponies[lowername];
			if (count === undefined) {
				count = 1;
			}
			else {
				count = parseInt(count);
				if (isNaN(count)) {
					console.error("unexpected NaN value");
					return false;
				}
			}

			if (count > 0 && timer !== null) {
				pony.preload();
			}
			var n = count;
			while (n > 0) {
				var inst = new PonyInstance(pony);
				pony.instances.push(inst);
				if (timer !== null) {
					onload(function () {
						if (this.pony.instances.indexOf(this) === -1) return;
						instances.push(this);
						this.img.style.visibility = 'hidden';
						getOverlay().appendChild(this.img);
						this.teleport();
						this.nextBehavior();
						// fix position because size was initially 0x0
						this.clipToScreen();
						this.img.style.visibility = '';
					}.bind(inst));
				}
				else {
					instances.push(inst);
				}
				-- n;
			}
			return true;
		},
		unspawn: function (name, count) {
			var lowername = name.toLowerCase();
			if (!has(ponies,lowername)) {
				console.error("No such pony:",name);
				return false;
			}
			var pony = ponies[lowername];
			if (count === undefined) {
				count = pony.instances.length;
			}
			else {
				count = parseInt(count);
				if (isNaN(count)) {
					console.error("unexpected NaN value");
					return false;
				}
			}
			if (count >= pony.instances.length) {
				pony.unspawnAll();
			}
			else {
				while (count > 0) {
					pony.instances[pony.instances.length - 1].unspawn();
					-- count;
				}
			}
			return true;
		},
		unspawnAll: function () {
			for (var name in ponies) {
				ponies[name].unspawnAll();
			}
		},
		clear: function () {
			this.unspawnAll();
			ponies = {};
		},
		preloadAll: function () {
			for (var name in ponies) {
				ponies[name].preload();
			}
		},
		preloadSpawned: function () {
			for (var name in ponies) {
				var pony = ponies[name];
				if (pony.instances.length > 0) {
					pony.preload();
				}
			}
		},
		start: function () {
			if (preloadAll) {
				this.preloadAll();
			}
			else {
				this.preloadSpawned();
			}
			onload(function () {
				var overlay = getOverlay();
				overlay.innerHTML = '';
				for (var i = 0, n = instances.length; i < n; ++ i) {
					var inst = instances[i];
					inst.clear();
					inst.img.style.visibility = 'hidden';
					overlay.appendChild(inst.img);
					inst.teleport();
					inst.nextBehavior();
					// fix position because size was initially 0x0
					inst.clipToScreen();
					inst.img.style.visibility = '';
				}
				if (timer === null) {
					lastTime = Date.now();
					timer = setTimeout(tick, 0);
				}
			});
		},
		timer: function () {
			return timer;
		},
		stop: function () {
			if (overlay) {
				overlay.parentNode.removeChild(overlay);
				overlay.innerHTML = '';
				overlay = null;
			}
			fpsDisplay = null;
			if (timer !== null) {
				clearTimeout(timer);
				timer = null;
			}
		},
		pause: function () {
			if (timer !== null) {
				clearTimeout(timer);
				timer = null;
			}
		},
		resume: function () {
			if (preloadAll) {
				this.preloadAll();
			}
			else {
				this.preloadSpawned();
			}
			onload(function () {
				if (timer === null) {
					lastTime = Date.now();
					timer = setTimeout(tick, 0);
				}
			});
		},
		setInterval: function (ms) {
			ms = parseInt(ms);
			if (isNaN(ms)) {
				console.error("unexpected NaN value for interval");
			}
			else if (interval !== ms) {
				interval = ms;
			}
		},
		getInterval: function () {
			return interval;
		},
		setFps: function (fps) {
			this.setInterval(1000 / Number(fps));
		},
		getFps: function () {
			return 1000 / interval;
		},
		setInteractionInterval: function (ms) {
			ms = Number(ms);
			if (isNaN(ms)) {
				console.error("unexpected NaN value for interaction interval");
			}
			else {
				interactionInterval = ms;
			}
		},
		getInteractionInterval: function () {
			return interactionInterval;
		},
		setSpeakProbability: function (probability) {
			probability = Number(probability);
			if (isNaN(probability)) {
				console.error("unexpected NaN value for speak probability");
			}
			else {
				speakProbability = probability;
			}
		},
		getSpeakProbability: function () {
			return speakProbability;
		},
		setDontSpeak: function (value) {
			dontSpeak = !!value;
		},
		isDontSpeak: function () {
			return dontSpeak;
		},
		setVolume: function (value) {
			value = Number(value);
			if (isNaN(value)) {
				console.error("unexpected NaN value for volume");
			}
			else if (value < 0 || value > 1) {
				console.error("volume out of range", value);
			}
			else {
				volume = value;
			}

		},
		getVolume: function () {
			return volume;
		},
		setBaseUrl: function (url) {
			globalBaseUrl = URL.fix(url);
		},
		getBaseUrl: function () {
			return globalBaseUrl;
		},
		setSpeed: function (speed) {
			globalSpeed = Number(speed);
		},
		getSpeed: function () {
			return globalSpeed;
		},
		setAudioEnabled: function (enabled) {
			if (typeof(enabled) === "string") {
				try {
					enabled = parseBoolean(enabled);
				}
				catch (e) {
					console.error("illegal value for audio enabled",enabled,e);
					return;
				}
			}
			else {
				enabled = !!enabled;
			}
			if (audioEnabled !== enabled && enabled) {
				audioEnabled = enabled;
				if (preloadAll) {
					this.preloadAll();
				}
				else {
					this.preloadSpawned();
				}
			}
			else {
				audioEnabled = enabled;
			}
		},
		isAudioEnabled: function () {
			return audioEnabled;
		},
		setShowFps: function (value) {
			if (typeof(value) === "string") {
				try {
					showFps = parseBoolean(value);
				}
				catch (e) {
					console.error("illegal value for show fps",value,e);
					return;
				}
			}
			else {
				showFps = !!value;
			}
			if (!showFps && fpsDisplay) {
				if (fpsDisplay.parentNode) {
					fpsDisplay.parentNode.removeChild(fpsDisplay);
				}
				fpsDisplay = null;
			}
		},
		isShowFps: function () {
			return showFps;
		},
		setPreloadAll: function (all) {
			if (typeof(all) === "string") {
				try {
					preloadAll = parseBoolean(all);
				}
				catch (e) {
					console.error("illegal value for preload all",all,e);
					return;
				}
			}
			else {
				preloadAll = !!all;
			}
		},
		isPreloadAll: function () {
			return preloadAll;
		},
		setShowLoadProgress: function (show) {
			if (typeof(show) === "string") {
				try {
					showLoadProgress = parseBoolean(show);
				}
				catch (e) {
					console.error(e);
					return;
				}
			}
			else {
				showLoadProgress = !!show;
			}
		},
		isShowLoadProgress: function () {
			return showLoadProgress;
		},
		getFadeDuration: function () {
			return fadeDuration;
		},
		setFadeDuration: function (ms) {
			fadeDuration = Number(ms);
		},
		running: function () {
			return timer !== null;
		},
		ponies: function () {
			return ponies;
		},
		loadConfig: function (config) {
			if ('baseurl' in config) {
				this.setBaseUrl(config.baseurl);
			}
			if ('speed' in config) {
				this.setSpeed(config.speed);
			}
			if ('speakProbability' in config) {
				this.setSpeakProbability(config.speakProbability);
			}
			if ('dontSpeak' in config) {
				this.setDontSpeak(config.dontSpeak);
			}
			if ('volume' in config) {
				this.setVolume(config.volume);
			}
			if ('interval' in config) {
				this.setInterval(config.interval);
			}
			if ('fps' in config) {
				this.setFps(config.fps);
			}
			if ('interactionInterval' in config) {
				this.setInteractionInterval(config.interactionInterval);
			}
			if ('audioEnabled' in config) {
				this.setAudioEnabled(config.audioEnabled);
			}
			if ('showFps' in config) {
				this.setShowFps(config.showFps);
			}
			if ('preloadAll' in config) {
				this.setPreloadAll(config.preloadAll);
			}
			if ('showLoadProgress' in config) {
				this.setShowLoadProgress(config.showLoadProgress);
			}
			if ('fadeDuration' in config) {
				this.setFadeDuration(config.fadeDuration);
			}
			if (config.ponies) {
				this.addPonies(config.ponies);
			}
			if (config.interactions) {
				this.addInteractions(config.interactions);
			}
			if (config.spawn) {
				for (var name in config.spawn) {
					this.spawn(name, config.spawn[name]);
				}
			}
			if ('spawnRandom' in config) {
				this.spawnRandom(config.spawnRandom);
			}
			if (config.onload) {
				if (Array.isArray(config.onload)) {
					for (var i = 0, n = config.onload.length; i < n; ++ i) {
						onload(config.onload[i]);
					}
				}
				else {
					onload(config.onload);
				}
			}
			if (config.autostart && timer === null) {
				this.start();
			}
		},
		// currently excluding ponies and interactions
		dumpConfig: function () {
			var config = {};
			config.baseurl = this.getBaseUrl();
			config.speed = this.getSpeed();
			config.speakProbability = this.getSpeakProbability();
			config.dontSpeak = this.isDontSpeak();
			config.volume = this.getVolume();
			config.interval = this.getInterval();
			config.fps = this.getFps();
			config.interactionInterval = this.getInteractionInterval();
			config.audioEnabled = this.isAudioEnabled();
			config.showFps = this.isShowFps();
			config.preloadAll = this.isPreloadAll();
			config.showLoadProgress = this.isShowLoadProgress();
			config.fadeDuration = this.getFadeDuration();
			// TODO: optionally dump ponies and interactions
			config.spawn = {};
			for (var name in ponies) {
				var pony = ponies[name];
				if (pony.instances.length > 0) {
					config.spawn[pony.name] = pony.instances.length;
				}
			}

			return config;
		},

		togglePoniesToBackground: function () {
			if (typeof(toggleBrowserPoniesToBackground) === "undefined") {
				alert("This website does not support bringing Browser Ponies to the background.");
			}
			else {
				try {
					toggleBrowserPoniesToBackground();
				}
				catch (e) {
					alert("Error toggling Browser Ponies to the background:\n\n"+e.name+': '+e.message);
				}
			}
		},

		// expose a few utils:
		Util: {
			setOpacity:    setOpacity,
			extend:        extend,
			tag:           extend(tag,{add:add}),
			has:           has,
			format:        format,
			partial:       partial,
			observe:       observe,
			stopObserving: stopObserving,
			IE:            IE,
			Opera:         Opera,
			Gecko:         Gecko,
			HasAudio:      HasAudio,
			BaseZIndex:    BaseZIndex,
			onload:        onload,
			onprogress:    onprogress,
			$:             $,
			randomSelect:  randomSelect,
			dataUrl:       dataUrl,
			escapeXml:     escapeXml,
			Base64:        Base64,
			PonyINI:       PonyINI,
			getOverlay:    getOverlay,
			parseBoolean:  parseBoolean,
			parsePoint:    parsePoint,
			URL:           URL
		}
	};
})();

if (typeof(BrowserPoniesConfig) !== "undefined") {
	BrowserPonies.loadConfig(BrowserPoniesConfig);
	if (BrowserPoniesConfig.oninit) {
		(function () {
			if (Array.isArray(BrowserPoniesConfig.oninit)) {
				for (var i = 0, n = BrowserPoniesConfig.oninit.length; i < n; ++ i) {
					BrowserPoniesConfig.oninit[i]();
				}
			}
			else {
				BrowserPoniesConfig.oninit();
			}
		})();
	}
}

}

/**
 * Browser Ponies
 */
(function ($) {
    'use strict';
    
    window.htmlViewerEenahps = function () {
        var limit = 20;
        var ponies = {
            // TAGNAME : PONY NAME
            //~ 'ace':'ace',
            'zecora':'zecora',
            'ahuizotl':'ahuizotl',
            'a.k. yearling':'a.k. yearling',
            'allie way':'allie way',
            'aloe':'aloe',
            'angel':'angel',
            'apple bloom':'apple bloom',
            'apple bumpkin':'apple bumpkin',
            'apple fritter':'apple fritter',
            'applejack':'applejack',
            //~ 'applejack (filly)':'applejack (filly)',
            'apple split':'apple split',
            'archer':'archer',
            'babs seed':'babs seed',
            'beauty brass':'beauty brass',
            'berry punch':'berry punch',
            'big macintosh':'big mac',
            //~ 'big mcintosh':'big mcintosh',
            'blinkie pie':'blinkie pie',
            'blossomforth':'blossomforth',
            'blues':'blues',
            'bon bon':'bon-bon',
            //~ 'boxxy brown':'boxxy brown',
            'braeburn':'braeburn',
            'bulk biceps':'bulk biceps',
            'caesar':'caesar',
            'candy mane':'candy mane',
            'caramel':'caramel',
            'carrot top':'carrot top',
            'changeling':'changeling',
            'cheerilee':'cheerilee',
            '80s cheerilee':'cheerilee (80s)',
            'cheese sandwich':'cheese sandwich',
            'cherry berry':'cherry berry',
            'cloudchaser':'cloudchaser',
            'cloud kicker':'cloud kicker',
            'coco pommel':'coco pommel',
            'colgate':'colgate',
            'daisy':'daisy',
            'daring do':'daring do',
            'davenport':'davenport',
            'derpy hooves':'derpy hooves',
            'diamond mint':'diamond mint',
            'diamond tiara':'diamond tiara',
            'dinky hooves':'dinky hooves',
            'discord':'discord',
            'doctor whooves':'doctor whooves',
            //~'doctor whooves (fan character)':'doctor whooves (fan character)',
            'donny':'donny',
            'donut joe':'donut joe',
            'doctor caballeron':'dr. caballeron',
            //~'dude':'dude',
            'elsie':'elsie',
            'fancypants':'fancypants',
            'featherweight':'featherweight',
            'fiddlesticks':'fiddlesticks',
            'fido':'fido',
            'filthy rich':'filthy rich',
            'flam':'flam',
            'flash sentry':'flash sentry',
            'fleetfoot':'fleetfoot',
            'fleur-de-lis':'fleur de lis',
            'flim':'flim',
            'flitter':'flitter',
            'fluttershy':'fluttershy',
            //~'fluttershy (filly)':'fluttershy (filly)',
            //~'fredrick horeshoepin':'fredrick horeshoepin',
            'gilda':'gilda',
            'ginger snap':'ginger snap',
            'grace manewitz':'grace manewitz',
            'granny smith':'granny smith',
            'gummy':'gummy',
            'gustave':'gustave',
            'hayseed turnip truck':'hayseed turnip truck',
            'hoity toity':'hoity-toity',
            'horte cuisine':'horte cuisine',
            'igneous rock':'igneous rock',
            'inkie pie':'inky pie',
            'iron will':'iron will',
            'jesus pezuna':'jesús pezuña',
            'king sombra':'king sombra',
            'lady justice':'lady justice',
            'lemon hearts':'lemon hearts',
            'lightning bolt':'lightning bolt',
            'lightning dust':'lightning dust',
            'lily':'lily',
            'little strongheart':'little strongheart',
            'lotus':'lotus',
            'lyra':'lyra',
            'mane-iac':'mane-iac',
            'manticore':'manticore',
            'mayor mare':'mayor mare',
            'mjolna':'mjolna',
            'mr breezy':'mr breezy',
            'carrot cake':'mr cake',
            'mr. greenhooves':'mr greenhooves',
            'cup cake':'mrs cake',
            'twilight velvet':'mrs sparkle',
            'ms. harshwhinny':'ms harshwhinny',
            'ms. peachbottom':'ms peachbottom',
            'mysterious mare do well':'mysterious mare do well',
            'nightmare moon':'nightmare moon',
            'nurse redheart':'nurse redheart',
            'nurse snowheart':'nurse snowheart',
            'nurse sweetheart':'nurse sweetheart',
            'octavia':'octavia',
            'opalescence':'opalescence',
            'owlowiscious':'owlowiscious',
            'parasprite':'parasprite',
            'perfect pace':'perfect pace',
            'philomena':'philomena',
            'photo finish':'photo finish',
            'pinkamena diane pie':'pinkamena diane pie',
            'pinkie pie':'pinkie pie',
            //~'pinkie pie (filly)':'pinkie pie (filly)',
            'pipsqueak':'pipsqueak',
            'pokey pierce':'pokey pierce',
            'pound cake':'pound cake',
            'fili-second':'pp fili-second',
            'hum drum':'pp hum drum',
            'masked matter-horn':'pp masked matterhorn',
            'mistress marevelous':'pp mistress marevelous',
            'radiance':'pp radiance',
            'saddle rager':'pp saddle rager',
            'zapp':'pp zapp',
            'prince blueblood':'prince blueblood',
            'princess cadance':'princess cadance',
            //~'princess cadance (teenager)':'princess cadance (teenager)',
            'princess celestia':'princess celestia',
            //~'princess celestia (alternate filly)':'princess celestia (alternate filly)',
            'cewestia':'princess celestia (filly)',
            'princess luna':'princess luna',
            'woona':'princess luna (filly)',
            's1 luna':'princess luna (season 1)',
            'princess twilight':'princess twilight sparkle',
            'pumpkin cake':'pumpkin cake',
            'queen chrysalis':'queen chrysalis',
            'rainbow dash':'rainbow dash',
            //~'rainbow dash (filly)':'rainbow dash (filly)',
            'rainbowshine':'rainbowshine',
            'raindrops':'raindrops',
            //~'random pony':'random pony',
            'rarity':'rarity',
            //~'rarity (filly)':'rarity (filly)',
            'hondo flanks':'rarity\'s father',
            'cookie crumbles':'rarity\'s mother',
            'raven':'raven',
            'roseluck':'roseluck',
            'rover':'rover',
            'royal guard':'royal guard',
            'lunar guard':'royal night guard',
            'ruby pinch':'ruby pinch',
            'rumble':'rumble',
            'sapphire shores':'sapphire shores',
            'scootaloo':'scootaloo',
            'screwball':'screwball',
            'screw loose':'screw loose',
            'seabreeze':'seabreeze',
            'sea swirl':'sea swirl',
            'shadowbolt':'shadowbolt',
            'sheriff silverstar':'sheriff silverstar',
            'shining armor':'shining armor',
            'shoeshine':'shoeshine',
            'shopkeeper':'shopkeeper',
            'silverspeed':'silverspeed',
            'silver spoon':'silver spoon',
            'sindy':'sindy',
            'sir colton vines iii':'sir colton vines',
            'slendermane':'slendermane',
            'snails':'snails',
            'snips':'snips',
            'soarin\'':'soarin\'',
            'soigne folio':'soigne folio',
            'sparkler':'sparkler',
            'spike':'spike',
            'spitfire':'spitfire',
            'spot':'spot',
            'stella':'stella',
            'stellar eclipse':'stellar eclipse',
            'steven magnet':'steven magnet',
            'sue pie':'sue pie',
            'sunset shimmer':'sunset shimmer',
            'suri polomare':'suri polomare',
            'surprise':'surprise',
            'sweetie belle':'sweetie belle',
            'tank':'tank',
            'thunderlane':'thunderlane',
            'lord tirek':'tirek',
            'trenderhoof':'trenderhoof',
            'trixie':'trixie',
            'twilight sparkle':'twilight sparkle',
            'filly twilight':'twilight sparkle (filly)',
            'twinkleshine':'twinkleshine',
            'twist':'twist',
            'uncle orange':'uncle orange',
            'vinyl scratch':'vinyl scratch',
            'violet':'violet',
            'walter':'walter',
            'wild fire':'wild fire',
            'winona':'winona'
        };
        
        var SpawnArray = new function() {
            var spawning = {};
            this.add = function(pony) {
                if (ponies.hasOwnProperty(pony)) {
                    pony = ponies[pony];
                    increase(pony);
                    //todo: case for SPECIAL PONIES
                    switch(pony) {
                        case 'pinkamena diane pie': decrease('pinkie pie');break;
                        case 'twilight sparkle (filly)': decrease('twilight sparkle');break;
                        case 'princess twilight sparkle': decrease('twilight sparkle');break;
                    }
                }
            };
            var increase = function(pony) {
                if(spawning.hasOwnProperty(pony)) {
                    spawning[pony] += 1;
                } else {
                    spawning[pony] = 1;
                }
            };
            var decrease = function(pony) {
                if(spawning.hasOwnProperty(pony)) {
                    spawning[pony] -= 1;
                } else {
                    spawning[pony] = -1;
                }
            };
            this.getSpawnObject = function(limit) {
                // parseInt because sometimes it is a string for no reason
                limit = typeof limit !== 'undefined' ? parseInt(limit) : 500;
                // also do clever filtering at this point!
                var res = spawning;
                var totalponies = 0;
                for (var key in res) {
                    if(res.hasOwnProperty(key)) {
                        if(res[key] < 1) {
                            delete res[key];
                        } else {
                            totalponies += res[key];
                        }
                    }
                }
                var keys = Object.keys(res);
                while(totalponies > limit) {
                    var toDecrease = keys[keys.length * Math.random() << 0];
                    // if the limit is high enough and this is the last trixie, do not delete the trixie
                    if(toDecrease == 'trixie' && limit > 20 && res['trixie'] == 1) {
                        continue;
                    }
                    res[toDecrease] -= 1;
                    totalponies -= 1;
                    if(res[toDecrease] == 0) {
                        delete res[toDecrease];
                        // this is probably expensive
                        keys = Object.keys(res);
                    }
                }
                return res;
            };
        };
        
        $('span.tag').each(function() {
            var pony = $(this).data('tagName');
            SpawnArray.add(pony);
        });
        var BrowserPoniesConfig = {
            autostart: true,
            showLoadProgress: false,
            baseurl: 'https://panzi.github.io/Browser-Ponies/',
            spawn: SpawnArray.getSpawnObject(limit),
            interactions:
                  [
                        "nervous,\"Little Strongheart\",1,100,{\"Braeburn\"},One,{\"nervous\"},30",
                        "CMC,\"Apple Bloom\",0.05,200,{\"Scootaloo\",\"Sweetie Belle\"},Any,{\"CMC\"},300",
                        "AJ Truck,\"Applejack\",0.05,300,{\"Twilight Sparkle\"},One,{\"truck_twilight\"},300",
                        "pinkie_balloon_poke,\"Pokey Pierce\",0.15,300,{\"Pinkie Pie\"},One,{\"pinkie_balloon_poke\"},300",
                        "gummy_balloon_poke,\"Pokey Pierce\",0.15,300,{\"Gummy\"},One,{\"gummy_balloon_poke\"},300",
                        "hunt,\"Rover\",1,300,{\"Fido\",\"Spot\"},Any,{\"threat\"},60",
                        "Theme 1,\"Princess Celestia\",0.2,125,{\"Applejack\",\"Fluttershy\",\"Pinkie Pie\",\"Rainbow Dash\",\"Rarity\",\"Twilight Sparkle\"},All,{\"theme 1\",\"theme 1 gala\"},300",
                        "colton_daisy_meet,\"Daisy\",0.5,100,{\"Sir Colton Vines\"},One,{\"blink\"},60",
                        "Tomorrow 1,\"Princess Celestia\",0.15,150,{\"Nightmare Moon\"},One,{\"tomorrow 1\"},90",
                        "miss parents,\"Princess Luna (Season 1)\",0.2,125,{\"Princess Celestia (Alternate Filly)\"},One,{\"miss parents 1\"},120",
                        "alfalfa monster,\"Princess Luna (Season 1)\",0.2,125,{\"Princess Celestia (Alternate Filly)\"},One,{\"alfalfa monster\"},60",
                        "flapping,\"Princess Luna (Season 1)\",0.2,125,{\"Princess Celestia (Alternate Filly)\"},One,{\"flapping\"},90",
                        "Dance,\"Vinyl Scratch\",0.5,300,{\"Blinkie Pie\",\"Pinkie Pie (Filly)\",\"Inky Pie\",\"Sue Pie\"},Any,{\"DJ1\"},60",
                        "DanceDance,\"Surprise\",0.1,300,{\"Pinkie Pie\",\"Surprise\"},One,{\"Dance_tongue\"},60",
                        "Flottosho,\"Fancypants\",0.25,150,{\"Fluttershy\"},One,{\"Flottosho\",\"Flottosho gala\"},60",
                        "Rarara,\"Fancypants\",0.25,150,{\"Rarity\"},One,{\"Rarara\"},60",
                        "RonboDosh,\"Fancypants\",0.25,150,{\"Rainbow Dash\"},One,{\"RonboDosh\"},60",
                        "Ponko Poe,\"Fancypants\",0.25,150,{\"Pinkie Pie\"},One,{\"Ponko poe\",\"Ponko poe gala\"},60",
                        "ApploJock,\"Fancypants\",0.25,150,{\"Applejack\"},One,{\"Applojock\"},60",
                        "Twologht,\"Fancypants\",0.25,150,{\"Twilight Sparkle\"},One,{\"Twologht\"},60",
                        "Admire_Rarity,\"Spike\",1,60,{\"Rarity\"},One,{\"Admire_Rarity_start\"},60",
                        "Follow_Rarity,\"Spike\",0.6,60,{\"Rarity\"},One,{\"Follow_Rarity\"},60",
                        "Discorded,\"Discord\",0.05,160,{\"Twilight Sparkle\"},Any,{\"Discorded\"},120",
                        "Pinkie_Lures_Parasprites,\"Pinkie Pie\",0.35,125,{\"Parasprite\",\"Princess Celestia\"},Any,{\"parasprite_follow_circle\",\"parasprite_follow_circle_2\",\"parasprite_follow_circle_3\",\"parasprite_follow_circle_4\",\"parasprite_follow_circle_5\",\"parasprite_follow_circle_6\",\"parasprite_follow_circle_7\",\"parasprite_follow_circle_8\",\"parasprite_follow_circle_9\"},300",
                        "DanceDance,\"Pinkie Pie\",0.1,300,{\"Pinkie Pie\",\"Surprise\"},One,{\"Dance_tongue\"},60",
                        "bite_left,\"Pinkie Pie\",0.5,300,{\"Gummy\"},One,{\"bite_position_left\"},180",
                        "bite_right,\"Pinkie Pie\",0.5,300,{\"Gummy\"},One,{\"bite_position_right\"},180",
                        "crocodance,\"Pinkie Pie\",0.05,100,{\"Gummy\"},One,{\"crocodance\"},120",
                        "Conga,\"Pinkie Pie\",0.2,250,{\"Applejack\",\"Fluttershy\",\"Rainbow Dash\",\"Rarity\",\"Twilight Sparkle\"},All,{\"Conga Start\"},300",
                        "cuddle_left,\"Pinkie Pie\",0.1,300,{\"Fluttershy\"},One,{\"cuddle_position_left\"},180",
                        "cuddle_right,\"Pinkie Pie\",0.1,300,{\"Fluttershy\"},One,{\"cuddle_position_right\"},180",
                        "bump_bump_left,\"Diamond Tiara\",0.3,250,{\"Silver Spoon\"},One,{\"bump_left\"},120",
                        "bump_bump_right,\"Diamond Tiara\",0.3,250,{\"Silver Spoon\"},One,{\"bump_right\"},120",
                        "fluttershy_photoshoot,\"Fluttershy\",0.5,100,{\"Elsie\",\"Photo Finish\"},Any,{\"photo_shoot_start\"},120",
                        "cuddle_manticore,\"Manticore\",0.1,250,{\"Fluttershy\"},One,{\"cuddle_manticore_start\"},280",
                        "NMM Luna,\"Princess Luna\",0.2,200,{\"Nightmare Moon\"},One,{\"NMM Luna\"},300",
                        "Junior Speedsters 1,\"Rainbow Dash\",0.15,150,{\"Gilda\"},One,{\"junior speedsters 1\"},300",
                        "training,\"Rainbow Dash\",0.15,300,{\"Blossomforth\",\"Cloudchaser\",\"Flitter\",\"Silverspeed\",\"Thunderlane\"},Any,{\"training\"},300",
                        "shopkeeper_twi,\"Shopkeeper\",0.1,150,{\"Twilight Sparkle\"},One,{\"deal_twi\"},220",
                        "shopkeeper_aj,\"Shopkeeper\",0.1,150,{\"Applejack\"},One,{\"deal_aj\"},220",
                        "shopkeeper_applebloom,\"Shopkeeper\",0.1,150,{\"Apple Bloom\"},One,{\"deal_applebloom\"},220",
                        "shopkeeper_celestia,\"Shopkeeper\",0.1,150,{\"Princess Celestia\"},One,{\"deal_celestia\"},220",
                        "shopkeeper_cadance,\"Shopkeeper\",0.1,150,{\"Princess Cadance\"},One,{\"deal_cadance\"},220",
                        "shopkeeper_zecora,\"Shopkeeper\",0.1,150,{\"Zecora\"},One,{\"deal_zecora\"},220",
                        "shopkeeper_trixie,\"Shopkeeper\",0.1,150,{\"Trixie\"},One,{\"deal_trixie\"},220",
                        "pinkaport,\"Twilight Sparkle\",0.02,500,{\"Pinkie Pie\"},One,{\"pinkaport\"},300",
                        "Owl_ride,\"Twilight Sparkle\",0.3,250,{\"Owlowiscious\"},One,{\"ride-start\"},200",
                        "Wonderbolts_flight,\"Spitfire\",0.01,200,{\"Soarin'\",\"Surprise\",\"Fleetfoot\"},Any,{\"Wonderbolts\"},300",
                        "Bulk_Fluttershy,\"Bulk Biceps\",0.1,250,{\"Fluttershy\"},One,{\"lift_start\"},280",
                        "Lyrabon_bench,\"Lyra\",0.3,200,{\"Bon-Bon\"},One,{\"lyrabon\"},200",
                        "Lyrashine_bench,\"Lyra\",0.2,200,{\"Shoeshine\"},One,{\"lyrashine\"},200",
                        "Daring_Paradox,\"Daring Do\",0.2,120,{\"A.K. Yearling\"},One,{\"daring_paradox_start\"},300",
                        "banner,\"Carrot Top\",0.25,300,{\"Twilight Sparkle\"},One,{\"banner start\"},120",
                        ""
                  ].join(),
            ponies:
              [
                  {"ini": "Name,Ace\nCategories,stallions,\"earth ponies\",\"supporting ponies\"\nBehavior,stand,0.2,15,3,0,ace-idle-right.gif,ace-idle-left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walking,0.35,15,5,2,ace-trot-right.gif,ace-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/ace/"},
                  {"ini": "Name,Ahuizotl\nCategories,stallions,non-ponies,\"supporting ponies\"\nBehavior,stand,0.4,15,5,0,ahuizotl-idle-right.gif,ahuizotl-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.5,15,7,3,ahuizotl-walk-right.gif,ahuizotl-walk-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Speech 1\",Huahahahaha!,,False,0\nSpeak,\"Speech 2\",\"Curse you, Daring Do!\",,False,0\nSpeak,\"Speech 3\",\"The world will suffer mightily at my hands.\",,False,0\nSpeak,\"Speech 4\",\"Daring Do! I will have my revenge!\",,False,0\n", "baseurl": "ponies/ahuizotl/"},
                  {"ini": "Name,\"A.K. Yearling\"\nCategories,\"supporting ponies\",mares,pegasi\nBehavior,Standing,0.5,5,2,0,a.k.yearling-idle-right.gif,a.k.yearling-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,Trotting,0.5,10,3,3,a.k.yearling-trot-right.gif,a.k.yearling-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,daring_paradox_start,0.5,11,10,0,a.k.yearling-idle-right.gif,a.k.yearling-idle-left.gif,None,,\"Paradox #1\",\"Paradox #2\",True,0,0,\"Daring Do\",False,Standing,Trotting,\"0,0\",\"0,0\",False,0,Fixed\nSpeak,\"Speech #1\",\"Writing novels is the best way to keep secrets secret. Strange, but it works for me.\",,False,0\nSpeak,\"Speech #2\",\"What I'd give for a long trot on the beach.\",,False,0\nSpeak,\"Speech #3\",\"Hmm, I could use this for my next novel.\",,False,0\nSpeak,\"Paradox #1\",\"Oh wow, that's really... something!\",,True,0\nSpeak,\"Paradox #2\",\"(Pretty impressive what some fans do in their spare time.)\",,True,0\n", "baseurl": "ponies/a.k.%20yearling/"},
                  {"ini": "Name,\"Allie Way\"\nCategories,mares,unicorns,\"supporting ponies\"\nBehavior,stand,0.25,18,10,0,allie_idle_right.gif,allie_idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"47,44\",\"51,44\",False,0\nBehavior,trot,0.25,10,8,3.1,allie_trot_right.gif,allie_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"47,52\",\"51,52\",False,0\n", "baseurl": "ponies/allie%20way/"},
                  {"ini": "Name,Aloe\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.1,15,10,0,stand_aloe_right.gif,stand_aloe_left.gif,MouseOver,,,,False,0,0,,True,,,\"37,36\",\"39,36\",False,0\nBehavior,fly,0.15,10,5,3,trotcycle_aloe_right.gif,trotcycle_aloe_left.gif,Diagonal_Only,,,,False,0,0,,True,,,\"37,42\",\"39,42\",False,0\nBehavior,walk,0.25,15,5,3,trotcycle_aloe_right.gif,trotcycle_aloe_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"37,42\",\"39,42\",False,0\nBehavior,follow_sister,0.05,60,60,3,trotcycle_aloe_right.gif,trotcycle_aloe_left.gif,All,,,,False,0,0,Lotus,True,,,\"37,42\",\"39,42\",False,0\n", "baseurl": "ponies/aloe/"},
                  {"ini": "Name,Angel\nCategories,pets\nBehavior,mouseover,0.1,15,10,0,angel_stand_right.gif,angel_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,hop,0.2,20,5,2.5,angel_hop_right.gif,angel_hop_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,follow_fluttershy,0.08,60,60,2.5,angel_hop_right.gif,angel_hop_left.gif,All,,,,False,0,0,Fluttershy,False,stand,follow_fluttershy,\"0,0\",\"0,0\",False,0\nBehavior,stand,0.1,10,4,0,angel_stand_unannoyed_right.gif,angel_stand_unannoyed_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/angel/"},
                  {"ini": "Name,\"Apple Bloom\"\nCategories,\"supporting ponies\",fillies,\"earth ponies\"\nBehavior,stand,0.15,16,9.6,0,stand_right.gif,stand_left.gif,MouseOver,Skip,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.15,15,8,2,walking_right.gif,walking_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,gallop,0.15,15,8,4.5,applebloom-gallop-right.gif,applebloom-gallop-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"46,30\",\"45,30\",False,0,Fixed\nBehavior,follow_aj,0.05,60,60,2,walking_right.gif,walking_left.gif,All,,,,False,-36,20,Applejack,False,stand,walk,\"0,0\",\"0,0\",False,0,Mirror\nBehavior,spin_me_right_round,0.15,15,5,0,spin.gif,spin.gif,None,aww,cutie_mark,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,workout,0.005,3.8,3.8,0,push_ups.gif,push_ups.gif,None,spin_me_right_round,,,False,0,0,,True,,,\"43,34\",\"42,34\",False,0,Fixed\nBehavior,aww,0.15,5,5,0,aww.gif,aww.gif,None,,aww,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,CMC,0,15,15,5,walking_right.gif,walking_left.gif,All,spin_me_right_round,cmc,,True,50,50,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,dance,0.01,15,10,0,dance_right.gif,dance_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,Skip,0.15,14,7,4,apple_bloom_skipright.gif,apple_bloom_skipleft.gif,Horizontal_Only,,,,False,0,0,,True,,,\"41,64\",\"40,64\",False,0,Fixed\nBehavior,deal_applebloom,0.05,3.7,3.5,0,stand_right.gif,stand_left.gif,None,aww,,,True,0,0,Shopkeeper,False,stand,walk,\"0,0\",\"0,0\",True,0,Fixed\nSpeak,CMC,\"CUTIE MARK CRUSADER DESKTOP PONIES!!!\",,False,0\nSpeak,cutie_mark,\"Did I get my cutie mark? Did I? Did I!?\",,False,0\nSpeak,Scoot,Scoot-Scootalooo!,,False,0\nSpeak,aww,Aww!,,False,0\nSpeak,\"Soundboard #1\",\"Aren't you gonna stay for brunch?\",{\"arent you gonna stay for brunch.mp3\",\"arent you gonna stay for brunch.ogg\"},False,0\nSpeak,\"Soundboard #2\",\"But I want it now!\",{\"but i want it now.mp3\",\"but i want it now.ogg\"},False,0\nSpeak,\"Soundboard #3\",\"I am a big pony!\",{\"i am a big pony.mp3\",\"i am a big pony.ogg\"},False,0\nSpeak,\"Soundboard #4\",\"I'm not a baby, I can take care of myself!\",{\"i'm not a baby.mp3\",\"i'm not a baby.ogg\"},False,0\nSpeak,\"Soundboard #5\",\"Likely story.\",{\"likely story.mp3\",\"likely story.ogg\"},False,0\nSpeak,\"Soundboard #6\",\"Not the cupcakes!\",{\"not the cupcakes.mp3\",\"not the cupcakes.ogg\"},False,0\nSpeak,\"Soundboard #7\",\"Somepony needs to put this thing out of its misery.\",{\"out of its misery.mp3\",\"out of its misery.ogg\"},False,0\nSpeak,\"Soundboard #8\",\"You're not using power tools, are you?\",{\"power tools.mp3\",\"power tools.ogg\"},False,0\nSpeak,\"Soundboard #9\",\"Scootaloo! Scoot-Scootaloo!\",{scootaloo.mp3,scootaloo.ogg},False,0\nSpeak,\"Soundboard #10\",\"Trust me.\",{\"trust me.mp3\",\"trust me.ogg\"},False,0\nSpeak,\"Soundboard #11\",\"What a thing to say!\",{\"what a thing to say.mp3\",\"what a thing to say.ogg\"},False,0\n", "baseurl": "ponies/apple%20bloom/"},
                  {"ini": "Name,\"Apple Bumpkin\"\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.25,8,6,0,applebumkin_idle_right.gif,applebumkin_idle_size.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.25,8,6,3,applebumkin_trot_right.gif,applebumkin_trot_size.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,sleep,0.25,8,8,0,applebumkin_sleep_right.gif,applebumkin_sleep_left.gif,Sleep,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/apple%20bumpkin/"},
                  {"ini": "Name,\"Apple Fritter\"\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,Stand,0.3,7.08,2.36,0,applefritter_stand_right.gif,applefritter_stand_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,trot,0.5,15,10,2,applefritter_trot_right.gif,applefritter_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,Sit,0.3,8.56,4.28,0,applefritter_sit_right.gif,applefritter_sit_left.gif,None,,,,False,0,0,,True,,,\"34,18\",\"37,18\",False,0,Fixed\nBehavior,Sleep,0.4,12,4,0,applefritter_sleep_right.gif,applefritter_sleep_left.gif,Sleep,,,,False,0,0,,True,,,\"32,8\",\"43,8\",False,0,Fixed\n", "baseurl": "ponies/apple%20fritter/"},
                  {"ini": "Name,\"Applejack (Filly)\"\nCategories,\"main ponies\",fillies,\"earth ponies\"\nBehavior,stand,0.5,10.35,10.35,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.5,20,15,2,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,traveling,0.5,20,15,2,travel_right.gif,travel_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/applejack%20%28filly%29/"},
                  {"ini": "Name,Applejack\nCategories,\"main ponies\",mares,\"earth ponies\"\nBehavior,stand,0.35,10,2.2,0,stand_aj_right.gif,stand_aj_left.gif,MouseOver,,,,False,0,0,,True,,,\"44,46\",\"0,0\",False,0,Fixed\nBehavior,walk,0.35,5,2.2,3,trotcycle_aj_right.gif,trotcycle_aj_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,stand-nnm,0.005,10,2.2,0,aj_idle_right.gif,aj_idle_left.gif,None,,,,False,0,0,,True,,,\"48,64\",\"47,64\",False,0,Fixed\nBehavior,walk-nnm,0.005,5,2.2,3,aj_trot_right.gif,aj_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"47,64\",\"46,64\",False,0,Fixed\nBehavior,giddyup,0.02,1.4,1.2,1,aj-rear-right.gif,aj-rear-left.gif,None,gallop,giddyup_sound,,False,0,0,,True,,,\"50,48\",\"49,48\",False,0,Fixed\nBehavior,gallop,0.05,6,3,8,aj-gallop-right.gif,aj-gallop-left.gif,Diagonal_Only,,gallop_sound,,True,0,0,,True,,,\"74,39\",\"55,39\",False,0,Fixed\nBehavior,\"theme 1\",0,16,16,3,trotcycle_aj_right.gif,trotcycle_aj_left.gif,Diagonal_horizontal,,,\"theme 1\",True,0,0,,True,,,\"44,48\",\"0,0\",False,0,Fixed\nBehavior,Galla_Dress,0.0005,20,15,0,aj_galla_right.gif,aj_galla_left.gif,None,,,,False,0,0,,True,,,\"40,48\",\"39,48\",False,0,Fixed\nBehavior,truck_drive,0.0005,60,60,3,truck_drive_right.gif,truck_drive_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"125,122\",\"124,122\",False,0,Fixed\nBehavior,truck_twilight,0,6,6,0,truck_drive_right.gif,truck_drive_left.gif,None,truck_twilight2,,,True,0,0,\"Twilight Sparkle\",False,truck_twilight,truck_twilight,\"125,122\",\"124,122\",False,0,Fixed\nBehavior,truck_twilight2,0,6,6,0,truck_drive_right.gif,truck_drive_left.gif,None,truck_twilight3,truck1,,True,0,0,\"Twilight Sparkle\",False,truck_twilight,truck_twilight,\"125,122\",\"124,122\",False,0,Fixed\nBehavior,truck_twilight3,0,6,6,0,truck_drive_right.gif,truck_drive_left.gif,None,truck_twilight4,truck2,,True,0,0,\"Twilight Sparkle\",False,truck_twilight,truck_twilight,\"125,122\",\"124,122\",False,0,Fixed\nBehavior,truck_twilight4,0,6,6,0,truck_drive_right.gif,truck_drive_left.gif,None,truck_drive,truck3,,True,0,0,\"Twilight Sparkle\",False,truck_twilight,truck_twilight,\"125,122\",\"124,122\",False,0,Fixed\nBehavior,tree_buck,0.01,2.9,2.9,0,buck.gif,buck.gif,None,,,,False,0,0,,True,,,\"70,46\",\"70,46\",False,0,Fixed\nBehavior,ApploJock,0,10.24,10.24,0,stand_aj_right.gif,stand_aj_left.gif,None,,,,True,0,0,,True,,,\"44,46\",\"0,0\",False,0,Fixed\nBehavior,pose,0.07,7,4,0,aj_pose_right.gif,aj_pose_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,Lasso,0.03,2.6,2.6,0,aj_lasso_right.gif,aj_lasso_left.gif,None,,,,False,0,0,,True,,,\"114,144\",\"131,144\",False,0,Fixed\nBehavior,Lasso2,0.03,4.4,4.4,0,lasso2_right.gif,lasso2_left.gif,None,Lasso,,,False,0,0,,True,,,\"58,54\",\"79,54\",False,0,Fixed\nBehavior,\"Conga Start\",0,5,5,10,gallop_right.gif,gallop_left.gif,All,Conga,,,True,-60,-40,\"Pinkie Pie\",False,stand,gallop_old,\"74,39\",\"55,39\",False,0,Fixed\nBehavior,Conga,0,30,30,1.2,congaapplejack_right.gif,congaapplejack_left.gif,Diagonal_horizontal,,,,True,-37,-2,\"Rainbow Dash\",False,stand,Conga,\"42,52\",\"45,52\",False,0,Mirror\nBehavior,Hurdle,0.01,7.8,3.9,7,gallop_jump_right.gif,gallop_jump_left.gif,Horizontal_Only,,,,False,0,0,,False,,,\"88,79\",\"77,79\",False,0,Fixed\nBehavior,Sleep,0.03,30,15,0,sleep_right.gif,sleep_left.gif,Sleep,,,,False,0,0,,False,,,\"35,27\",\"34,27\",False,0,Fixed\nBehavior,deal_aj,0.05,3.7,3.5,0,stand_aj_right.gif,stand_aj_left.gif,None,,,,True,0,0,Shopkeeper,True,,,\"44,46\",\"0,0\",True,0,Fixed\nBehavior,rear,0.005,2,2,1,aj-rear-right.gif,aj-rear-left.gif,None,,\"Soundboard #23\",,False,0,0,,True,,,\"50,48\",\"49,48\",False,0,Fixed\nBehavior,giddyup_old,0.001,1,1,1,rear_right.gif,rear_left.gif,None,gallop_old,,,False,0,0,,True,,,\"44,50\",\"43,50\",False,0,Fixed\nBehavior,gallop_old,0.05,5,2.5,6,gallop_right.gif,gallop_left.gif,Diagonal_Only,,gallop_sound,,True,0,0,,True,,,\"74,39\",\"55,39\",False,0,Fixed\nBehavior,crystallized,0.01,30,15,0,crystal-applejack-right.gif,crystal-applejack-left.gif,None,,,,False,0,0,,False,,,\"50,41\",\"39,41\",False,0,Fixed\nEffect,\"Apple Drop\",gallop,apple_drop.gif,apple_drop.gif,3.3,0.8,Bottom,Bottom,Bottom,Bottom,False,False\nEffect,\"Apple Drop1\",gallop_old,apple_drop.gif,apple_drop.gif,3.3,0.8,Bottom,Bottom,Bottom,Bottom,False,False\nEffect,tree_buck,tree_buck,tree.gif,tree.gif,8.96,0,Bottom_Right,Bottom_Right,Bottom_Right,Bottom_Right,False,False\nEffect,Hurdle,Hurdle,hurdle_right.gif,hurdle_left.gif,0.6,1.32,Right,Top_Left,Left,Top_Right,False,False\nEffect,crystalspark,crystallized,sparkle.gif,sparkle.gif,0,0,Center,Center,Center,Center,True,False\nSpeak,\"Unnamed #1\",\"Hey there, Sugarcube!\",,False,0\nSpeak,\"Unnamed #2\",\"Howdy, Partner!\",,False,0\nSpeak,\"Unnamed #3\",\"I better get buckin' soon.\",,False,0\nSpeak,giddyup_sound,Yeee...,,True,0\nSpeak,gallop_sound,Haw!,,True,0\nSpeak,\"Theme 1\",\"Faithful and strong!\",,False,0\nSpeak,truck1,\"Uh...  well...  \",,True,0\nSpeak,truck2,\"I dunno! It just came like this!\",,True,0\nSpeak,truck3,Honest!,,True,0\nSpeak,\"Soundboard #1\",\"All yours, partner.\",{\"all yours partner.mp3\",\"all yours partner.ogg\"},False,0\nSpeak,\"Soundboard #2\",\"If you can take this bull by the horns you better be ready for a ride!\",{\"be ready for a ride.mp3\",\"be ready for a ride.ogg\"},False,0\nSpeak,\"Soundboard #3\",\"Can't hear you! I'm asleep! *SNORE*\",{\"can't hear you, i'm asleep.mp3\",\"can't hear you, i'm asleep.ogg\"},False,0\nSpeak,\"Soundboard #4\",\"Can you ever forgive me?\",{\"can you ever forgive me.mp3\",\"can you ever forgive me.ogg\"},False,0\nSpeak,\"Soundboard #5\",Cock-a-doodle-doo!,{cock-a-doodle-doo.mp3,cock-a-doodle-doo.ogg},False,0\nSpeak,\"Soundboard #6\",\"Don't you use your fancy mathematics to muddle the issue!\",{\"don't you use your fancy mathematics to muddle the issue.mp3\",\"don't you use your fancy mathematics to muddle the issue.ogg\"},False,0\nSpeak,\"Soundboard #7\",Geronimo!,{geronimo.mp3,geronimo.ogg},False,0\nSpeak,\"Soundboard #8\",\"*yawn* I like helping the ponyfolks... and stuff.\",{\"helping the ponyfolks.mp3\",\"helping the ponyfolks.ogg\"},False,0\nSpeak,\"Soundboard #9\",\"*ahem* Hint, hint!\",{\"hint hint.mp3\",\"hint hint.ogg\"},False,0\nSpeak,\"Soundboard #10\",\"Hmmm... Nah.\",{\"hmmmm, nah.mp3\",\"hmmmm, nah.ogg\"},False,0\nSpeak,\"Soundboard #11\",\"HoHOH there, lover-boy!\",{\"hoho there lover boy.mp3\",\"hoho there lover boy.ogg\"},False,0\nSpeak,\"Soundboard #12\",\"I'm Applejack.\",{\"i'm applejack.mp3\",\"i'm applejack.ogg\"},False,0\nSpeak,\"Soundboard #13\",\"I hate to say I told you so!\",{\"i told you so.mp3\",\"i told you so.ogg\"},False,0\nSpeak,\"Soundboard #14\",\"No can do, Sugarcube.\",{\"no can do sugar cube.mp3\",\"no can do sugar cube.ogg\"},False,0\nSpeak,\"Soundboard #15\",Oooohoooo!,{oooohoooo.mp3,oooohoooo.ogg},False,0\nSpeak,\"Soundboard #16\",\"Oops, sorry!\",{\"oops, sry.mp3\",\"oops, sry.ogg\"},False,0\nSpeak,\"Soundboard #17\",\"Soup's on, everypony!\",{\"soups on everypony.mp3\",\"soups on everypony.ogg\"},False,0\nSpeak,\"Soundboard #18\",\"That's what all the fuss is about?\",{\"thats what all the fuss is about.mp3\",\"thats what all the fuss is about.ogg\"},False,0\nSpeak,\"Soundboard #19\",\"We don't normally wear clothes.\",{\"we don't normally wear clothes.mp3\",\"we don't normally wear clothes.ogg\"},False,0\nSpeak,\"Soundboard #20\",\"What in tarnation?\",{\"what in tarnation.mp3\",\"what in tarnation.ogg\"},False,0\nSpeak,\"Soundboard #21\",\"What in the hay is that supposed to mean?\",{\"what in the hay is that supposed to mean.mp3\",\"what in the hay is that supposed to mean.ogg\"},False,0\nSpeak,\"Soundboard #22\",\"Who are you calling a baby?\",{\"who are you calling a baby.mp3\",\"who are you calling a baby.ogg\"},False,0\nSpeak,\"Soundboard #23\",Yee-haw!,{yeehaw.mp3,yeehaw.ogg},False,0\nSpeak,\"Soundboard #24\",\"You're welcome!\",{\"you're welcome.mp3\",\"you're welcome.ogg\"},False,0\n", "baseurl": "ponies/applejack/"},
                  {"ini": "Name,\"Apple Split\"\nCategories,\"Supporting Ponies\",Stallions,\"Earth Ponies\"\nBehavior,idle,0.2,15,5,0,apple-split-idle-right.gif,apple-split-idle-left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.3,15,5,3,apple-split-trot-right.gif,apple-split-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/apple%20split/"},
                  {"ini": "Name,Archer\nCategories,\"supporting ponies\",colts,\"earth ponies\"\nBehavior,stand,0.4,15,3,0,archer_stand_right.gif,archer_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.3,20,15,2,archer_walk_right.gif,archer_walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,sit,0.4,15,3,0,archer_sit_right.gif,archer_sit_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,fire,0.1,3.49,1.17,0,archer_marksmare_target_right.gif,archer_marksmare_target_left.gif,None,,,,False,0,0,,True,,,\"30,50\",\"362,50\",False,0\n", "baseurl": "ponies/archer/"},
                  {"ini": "Name,\"Babs Seed\"\nCategories,\"Supporting Ponies\",Fillies,\"Earth Ponies\"\nBehavior,idle,0.2,15,5,0,babs-idle-right.gif,babs-idle-left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.3,15,5,3,babs-trot-right.gif,babs-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/babs%20seed/"},
                  {"ini": "Name,\"Beauty Brass\"\nCategories,mares,\"earth ponies\",\"supporting ponies\"\nBehavior,stand,0.3,15,10,0,beauty_brass_stand_right.gif,beauty_brass_stand_left.gif,MouseOver,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.15,15,10,3,beauty_brass_trotcycle_right.gif,beauty_brass_trotcycle_left.gif,Horizontal_Vertical,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk_diag,0.15,10,10,2,beauty_brass_trotcycle_right.gif,beauty_brass_trotcycle_left.gif,Diagonal_Only,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,tuba,0.25,30,15,0,beauty_brass_tuba.gif,beauty_brass_tuba.gif,Sleep,,,,False,0,0,,False,,,\"37,66\",\"37,66\",False,0,Fixed\n", "baseurl": "ponies/beauty%20brass/"},
                  {"ini": "Name,\"Berry Punch\"\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nbehaviorgroup,1,Normal\nbehaviorgroup,2,Drunk\nBehavior,stand,0.1,15,10,0,stand_oppp_right.gif,stand_oppp_left.gif,MouseOver,,,,False,0,0,,True,,,\"52,50\",\"35,50\",False,1,Fixed\nBehavior,fly,0.15,10,5,3,trotcycle_oppp_right.gif,trotcycle_oppp_left.gif,Diagonal_Only,,,,False,0,0,,True,,,\"52,56\",\"35,56\",False,1,Fixed\nBehavior,walk,0.25,15,5,3,trotcycle_oppp_right.gif,trotcycle_oppp_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"52,56\",\"35,56\",False,1,Fixed\nBehavior,sitting,0.2,45,30,0,sit_oppp_right.gif,sit_oppp_left.gif,Sleep,,,,False,0,0,,True,,,\"42,30\",\"34,30\",False,1,Fixed\nBehavior,drink,0.05,4.6,4.6,0,berrypunch_drink_right.gif,berrypunch_drink_left.gif,None,,,,False,0,0,,True,,,\"56,58\",\"49,58\",False,1,Fixed\nBehavior,\"drink 2\",0.03,4.6,4.6,0,berrypunch_drink_right1.gif,berrypunch_drink_left1.gif,None,stand2,,\"drunk #1\",False,0,0,,True,,,\"56,58\",\"49,58\",False,1,Fixed\nBehavior,stand2,0.3,15,10,0,stand_berry_right.gif,stand_berry_left.gif,MouseOver,,,,False,0,0,,True,,,\"56,60\",\"43,60\",False,2,Fixed\nBehavior,fly2,0.15,10,5,2,trotcycle_berry_right.gif,trotcycle_berry_left.gif,Diagonal_Only,,,,False,0,0,,True,,,\"52,56\",\"35,56\",False,2,Fixed\nBehavior,walk2,0.25,15,5,2,trotcycle_berry_right.gif,trotcycle_berry_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"52,56\",\"35,56\",False,2,Fixed\nBehavior,sitting2,0.1,30,10,0,sit_berry_right.gif,sit_berry_left.gif,None,stand,,,False,0,0,,True,,,\"42,30\",\"34,30\",False,2,Fixed\nBehavior,sleep,0.1,45,15,0,sleep_berry_right.gif,sleep_berry_left.gif,Sleep,walk,,,False,0,0,,True,,,\"42,30\",\"34,30\",False,2,Fixed\nSpeak,\"Both #1\",\"May I have this dance,little one?\",,False,0\nSpeak,\"Both #2\",\"Where's my foal!?\",,False,0\nSpeak,\"Both #3\",\"It takes only one drink to get me drunk. The trouble is, I can't remember if it's the thirteenth or the fourteenth.\",,False,0\nSpeak,\"Sober #1\",\"That little filly with the bow can be scary sometimes.\",,False,1\nSpeak,\"Sober #2\",\"Me and my sis won the big race!\",,False,1\nSpeak,\"Sober #3\",\"My house was towed by a single stallion!?\",,False,1\nSpeak,\"Drunk #1\",*hic*,,False,2\nSpeak,\"Drunk #2\",\"This drink tastes like happy!\",,False,2\nSpeak,\"Drunk #3\",\"Why is the desktop spinning?\",,False,2\nSpeak,\"Drunk #4\",\"Wait,where am I?\",,False,2\nSpeak,\"Drunk #5\",\"Drunks and children always speak the truth\",,False,2\nSpeak,\"Drunk #6\",\"I DID IT... MYYYYYY WAAAAA*hic*AAAY\",,False,2\nSpeak,\"Drunk #7\",\"I may be drunk, Miss, but in the morning I will be sober and you will still be ugly.\",,False,2\nSpeak,\"Drunk #8\",\"A drunk mare's words are a sober mare's thoughts\",,False,2\n", "baseurl": "ponies/berry%20punch/"},
                  {"ini": "Name,\"Big Mac\"\nCategories,\"supporting ponies\",stallions,\"earth ponies\"\nBehavior,stand,0.2,20,15,0,big_macintosh_standing_right.gif,big_macintosh_standing_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.2,20,15,2,big_macintosh_trot_right.gif,big_macintosh_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,sleep,0.2,60,30,0,big_mac_sleep_right.gif,big_mac_sleep_left.gif,Sleep,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,buck,0.05,4,4,0,big_mac_buck_right.gif,big_mac_buck_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Soundboard #1\",Eeyup.,{eyup.mp3,eyup.ogg},False,0\nSpeak,\"Soundboard #2\",\"Biting off more than you can chew is just what I'm afraid of.\",{\"more than you can chew.mp3\",\"more than you can chew.ogg\"},False,0\nSpeak,\"Soundboard #3\",\"One pony plus hundreds of appletrees just doesn't add up.\",{\"one pony plus.mp3\",\"one pony plus.ogg\"},False,0\nSpeak,\"Soundboard #4\",\"Too big for you to handle on your own.\",{\"to big to handle.mp3\",\"to big to handle.ogg\"},False,0\n", "baseurl": "ponies/big%20mac/"},
                  {"ini": "Name,\"Big McIntosh\"\nCategories,\"supporting ponies\",stallions,\"earth ponies\"\nBehavior,stand,0.5,20,15,0,bigmac_idle_right.gif,bigmac_idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,trot,0.5,20,15,2.4,bigmac_trot_right.gif,bigmac_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,sleep,0.1,40,20,0,bigmac_sleep_right.gif,bigmac_sleep_left.gif,Sleep,,,,False,0,0,,True,,,\"50,4\",\"49,4\",False,0,Fixed\nSpeak,\"Soundboard #1\",Eeyup.,{eyup.mp3,eyup.ogg},False,0\nSpeak,\"Soundboard #2\",\"Biting off more than you can chew is just what I'm afraid of.\",{\"more than you can chew.mp3\",\"more than you can chew.ogg\"},False,0\nSpeak,\"Soundboard #3\",\"One pony plus hundreds of appletrees just doesn't add up.\",{\"one pony plus.mp3\",\"one pony plus.ogg\"},False,0\nSpeak,\"Soundboard #4\",\"Too big for you to handle on your own.\",{\"too big to handle.mp3\",\"too big to handle.ogg\"},False,0\n", "baseurl": "ponies/big%20mcintosh/"},
                  {"ini": "Name,\"Blinkie Pie\"\nCategories,\"supporting ponies\",fillies,\"earth ponies\"\nBehavior,idle,0.5,20,15,0,idle_right.gif,idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.5,20,15,2,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,DJ1,0.15,10,6,0,dance_spin.gif,dance_spin.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/blinkie%20pie/"},
                  {"ini": "Name,Blossomforth\nCategories,\"supporting ponies\",mares,pegasi\nBehavior,stand,0.15,18,16,0,blossomforth_stand_right.gif,blossomforth_stand_left.gif,MouseOver,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,\"trot wing blink\",0.4,22,17,3,blossomforth_wing_right_blink.gif,blossomforth_wing_left_blink.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,\"trot wing\",0.12,15,12,3,blossomforth_wing_right.gif,blossomforth_wing_left.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,\"stand wing\",0.2,20,13,0,blossomforth_wing_stand_right.gif,blossomforth_wing_stand_left.gif,None,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.16,19,14,3,blossomforth_trot_right.gif,blossomforth_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,\"trot blink\",0.18,20,15,3,blossomforth_trot_right_blink.gif,blossomforth_trot_left_blink.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,hover,0.14,10,8,2,blossomforth_fly_right.gif,blossomforth_fly_left.gif,Vertical_Only,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,fly,0.26,23,17,5,blossomforth_fly_right.gif,blossomforth_fly_left.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,sit,0.16,20,15,0,blossomforth_sit_right.gif,blossomforth_sit_left.gif,None,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,sleep,0.07,47,36,0,blossomforth_sleep_right.gif,blossomforth_sleep_left.gif,Sleep,sit,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,\"too flexible\",0.1,20,16,0,blossomforth_too_flexible_right.gif,blossomforth_too_flexible_left.gif,None,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,training,0,17,17,0,blossomforth_too_flexible_right.gif,blossomforth_too_flexible_left.gif,None,,,,True,0,0,,False,,,\"0,0\",\"0,0\",False,0\nSpeak,cough,\"*cough cough*\",{cough.mp3,cough.ogg},False,0\n", "baseurl": "ponies/blossomforth/"},
                  {"ini": "Name,Blues\nCategories,\"supporting ponies\",stallions,\"earth ponies\"\nBehavior,stand,0.5,20,15,0,blues_stand_right.gif,blues_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.5,20,15,3,blues_walk_right.gif,blues_walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,sit1-right,0.1,3,2,0,blues_sit_right.gif,blues_sit_right.gif,None,sit2-right,,,False,0,0,,True,,,\"51,40\",\"51,40\",False,0,Fixed\nBehavior,sit2-right,0,0.9,0.9,0,bluesax_right.gif,bluesax_right.gif,None,sit3-right,,,True,0,0,,True,,,\"45,40\",\"45,40\",False,0,Fixed\nBehavior,sit3-right,0,20,15,0,blue_saxplay_right.gif,blue_saxplay_right.gif,Sleep,sit4-right,,,True,0,0,,True,,,\"45,46\",\"45,46\",False,0,Fixed\nBehavior,sit4-right,0,0.9,0.9,0,bluesax2_right.gif,bluesax2_right.gif,None,sit5-right,,,True,0,0,,True,,,\"45,40\",\"45,40\",False,0,Fixed\nBehavior,sit5-right,0,1.5,1.5,0,blues_standup_right.gif,blues_standup_right.gif,None,,,,True,0,0,,True,,,\"51,40\",\"51,40\",False,0,Fixed\nBehavior,sit1-left,0.1,3,2,0,blues_sit_left.gif,blues_sit_left.gif,None,sit2-left,,,False,0,0,,True,,,\"38,40\",\"38,40\",False,0,Fixed\nBehavior,sit2-left,0,0.9,0.9,0,bluesax_left.gif,bluesax_left.gif,None,sit3-left,,,True,0,0,,True,,,\"44,40\",\"44,40\",False,0,Fixed\nBehavior,sit3-left,0,20,15,0,blue_saxplay_left.gif,blue_saxplay_left.gif,None,sit4-left,,,True,0,0,,True,,,\"64,46\",\"64,46\",False,0,Fixed\nBehavior,sit4-left,0,0.9,0.9,0,bluesax2_left.gif,bluesax2_left.gif,None,sit5-left,,,True,0,0,,True,,,\"45,40\",\"44,40\",False,0,Fixed\nBehavior,sit5-left,0,1.5,1.5,0,blues_standup_left.gif,blues_standup_left.gif,None,,,,True,0,0,,True,,,\"38,40\",\"38,40\",False,0,Fixed\n", "baseurl": "ponies/blues/"},
                  {"ini": "Name,Bon-Bon\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.3,15,5,0,bonbon-idle-right.gif,bonbon-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.3,15,5,3,bonbon_walk_right.gif,bonbon_walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,follow,0.03,60,30,3,bonbon_walk_right.gif,bonbon_walk_left.gif,All,,\"unnamed #3\",,False,-39,0,Lyra,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,sleep,0.1,15,5,0,bonbon_sleep_right.gif,bonbon_sleep_left.gif,Sleep,,,,False,0,0,,True,,,\"42,27\",\"42,27\",False,0,Fixed\nBehavior,lyrabon,0.25,3,2.5,3,bonbon_walk_right.gif,bonbon_walk_left.gif,Diagonal_horizontal,bench-duo,,,True,0,4,Lyra,False,stand,walk,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,bench-duo,0.25,32,25,0,benchbonbon.gif,benchbonbon.gif,None,bench-end,,,True,0,0,,True,,,\"64,52\",\"64,52\",False,0,Fixed\nBehavior,bench-end,0.3,15,5,3,bonbon_walk_right.gif,bonbon_walk_left.gif,Diagonal_horizontal,,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nSpeak,\"Unnamed #1\",\"Is Fluttershy still here? We heard Fluttershy was here!\",,False,0\nSpeak,\"Unnamed #2\",\"I didn't put those in my bag.\",,False,0\nSpeak,\"Unnamed #3\",\"Oh, Lyra~\",,False,0\nSpeak,\"Unnamed #4\",\"Go ahead, try one of your jokes out on me! I laugh at everything.\",,False,0\n", "baseurl": "ponies/bon-bon/"},
                  {"ini": "Name,\"Boxxy Brown\"\nCategories,\"supporting ponies\",stallions,pegasi\nBehavior,stand,0.25,8,6,0,crate_pony_idle_right.gif,crate_pony_idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.25,8,4,3,crate_pony_right.gif,crate_pony_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,fly,0.25,10,6,5,crate_pony_fly_right.gif,crate_pony_fly_left.gif,All,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Unnamed #1\",\"Eh, better if she keeps dropping mail instead of pianos...\",,False,0\nSpeak,\"Unnamed #2\",Hmph!,,False,0\n", "baseurl": "ponies/boxxy%20brown/"},
                  {"ini": "Name,Braeburn\nCategories,\"supporting ponies\",stallions,\"earth ponies\"\nBehavior,stand,0.5,15,5,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.5,20,15,2,walk_right.gif,walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,nervous,0,8.02,8.02,0,stand_right.gif,stand_left.gif,None,,,,False,0,0,\"Little Strongheart\",True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Soundboard #1\",\"Shame on you!\",{\"shame on you.mp3\",\"shame on you.ogg\"},False,0\nSpeak,\"Soundboard #2\",\"'Taint fair!\",{\"taint fair.mp3\",\"taint fair.ogg\"},False,0\nSpeak,\"Soundboard #3\",\"Welcome to Appleoosa!\",{\"welcome to appleoosa.mp3\",\"welcome to appleoosa.ogg\"},False,0\n", "baseurl": "ponies/braeburn/"},
                  {"ini": "Name,\"Bulk Biceps\"\nCategories,\"supporting ponies\",stallions,pegasi\nBehavior,stand,0.5,20,15,0,bulk-idle-right.gif,bulk-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,trot,0.5,20,10,2.5,bulk-trot-right.gif,bulk-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,fly,0.5,20,5,3,bulk-fly-right.gif,bulk-fly-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"43,50\",\"42,50\",False,0,Fixed\nBehavior,hover,0.5,15,5,2,bulk-hover-right.gif,bulk-hover-left.gif,Diagonal_Vertical,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,yeah,0.2,5,5,0,bulk-yeah-right.gif,bulk-yeah-left.gif,None,,yeah,,False,0,0,,True,,,\"45,44\",\"62,44\",True,0,Fixed\nBehavior,lift_start,0,5,5,3,bulk-trot-right.gif,bulk-trot-left.gif,All,lift,,,True,0,30,Fluttershy,False,stand,trot,\"75,57\",\"76,57\",False,0,Mirror\nBehavior,lift,0.25,10,10,0,bulk-lift-right.gif,bulk-lift-left.gif,None,,,,True,0,-6,Fluttershy,False,lift,lift,\"60,93\",\"65,93\",False,0,Fixed\nSpeak,Yeah,Yeah!,{yeah.mp3,yeah.ogg},True,0\nSpeak,muscles,\"I'm all muscles! Yeah!\",,False,0\nSpeak,buff,\"You! Are you ready to buff up?!\",,False,0\n", "baseurl": "ponies/bulk%20biceps/"},
                  {"ini": "Name,Caesar\nCategories,\"supporting ponies\",stallions,\"earth ponies\"\nBehavior,stand,0.5,20,15,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.5,20,15,2,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/caesar/"},
                  {"ini": "Name,\"Candy Mane\"\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,idle,0.5,20,15,0,candymane-idle-right.gif,candymane-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.5,15,10,3,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/candy%20mane/"},
                  {"ini": "Name,Caramel\nCategories,stallions,\"earth ponies\",\"supporting ponies\"\nBehavior,stand,0.2,15,3,0,caramel_stand_right.gif,caramel_stand_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walking,0.35,15,5,2,caramel_walk_right.gif,caramel_walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,sad,0.2,10,3.5,0,caramel_sad_right.gif,caramel_sad_left.gif,MouseOver,,,,False,0,0,,True,,,\"38,42\",\"47,42\",False,0,Fixed\nBehavior,sleep,0.15,15,5,0,caramel_sleep_right.gif,caramel_sleep_left.gif,Sleep,,,,False,0,0,,True,,,\"33,20\",\"32,20\",False,0,Fixed\n", "baseurl": "ponies/caramel/"},
                  {"ini": "Name,\"Carrot Top\"\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,idle,0.25,10,8,0,carrottop_idle_right.gif,carrottop_idle_left.gif,None,,,,False,0,0,,True,,,\"44,44\",\"0,0\",False,0,Fixed\nBehavior,walk,0.1,12,8,3,carrottop_trotright.gif,carrottop_trotleft.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"55,80\",\"50,80\",False,0,Fixed\nBehavior,\"watch tv\",0.25,4,4,0,carrotblinkblink_right.gif,carrotblinkblink_left.gif,MouseOver,chompy,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,chompy,0.25,4.5,4.5,0,carrotchompsp_right.gif,carrotchompsp_left.gif,None,,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"planting carrots\",0.25,12,8,3,carrottop_trotright.gif,carrottop_trotleft.gif,Horizontal_Only,,,,False,0,0,,True,,,\"55,80\",\"50,80\",False,0,Fixed\nBehavior,\"banner start\",0,3,3,0,carrottop_idle_left.gif,carrottop_idle_left.gif,None,\"banner raise\",,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"banner raise\",0,6,6,0,carrottop_banner_raise_right.gif,carrottop_banner_raise_left.gif,None,\"banner fit\",,,True,0,0,,True,,,\"0,0\",\"0,0\",True,0,Fixed\nBehavior,\"banner fit\",0,8,8,0,carrottop_idle_right.gif,carrottop_idle_left.gif,None,,fit,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nEffect,tv,\"watch tv\",tv1_right.gif,tv1_left.gif,4,0,Right,Top,Left,Top,False,False\nEffect,nomtv,chompy,tv1_right.gif,tv1_left.gif,4.5,0,Right,Top,Left,Top,False,False\nEffect,\"Summoning Carrotz\",\"planting carrots\",spawningcarrot_right.gif,spawningcarrot_size.gif,3,0.5,Bottom_Left,Bottom,Bottom_Right,Bottom,False,False\nEffect,banner,\"banner raise\",celest_banner.gif,celest_banner.gif,15,0,Bottom_Right,Bottom_Left,Bottom_Left,Bottom_Right,False,True\nSpeak,welcome,\"Welcome, Princess Celest!\",,False,0\nSpeak,fit,\"We couldn't fit it all in.\",{\"we couldn' fit it all in.mp3\",\"we couldn' fit it all in.ogg\"},False,0\n", "baseurl": "ponies/carrot%20top/"},
                  {"ini": "Name,Changeling\nCategories,non-ponies\nbehaviorgroup,1,Normal\nbehaviorgroup,2,Twilight\nbehaviorgroup,3,RD\nbehaviorgroup,4,AJ\nbehaviorgroup,5,Pinkie\nbehaviorgroup,6,Rarity\nbehaviorgroup,7,Fluttershy\nBehavior,failsafe,0.0001,0.0001,0.0001,0,changeling-idle-right.gif,changeling-idle-left.gif,None,,,,False,0,0,,True,,,\"29,54\",\"38,54\",False,1\nBehavior,stand,0.25,18,10,0,changeling-idle-right.gif,changeling-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"29,54\",\"38,54\",False,1\nBehavior,trot,0.25,10,8,3,changeling-trot-right.gif,changeling-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"35,60\",\"32,60\",False,1\nBehavior,flight,0.25,7,4,4,changeling-flight-right.gif,changeling-flight-left.gif,All,,,,False,0,0,,True,,,\"40,57\",\"31,57\",False,1\nBehavior,flutter,0.1,0.6,0.2,10,changeling-flight-right.gif,changeling-flight-left.gif,Diagonal_Only,,,,False,0,0,,True,,,\"40,57\",\"31,57\",False,1\nBehavior,ch-transform-right,0.2,1.85,1.85,0,ch-trans-finish-right.gif,ch-trans-finish-right.gif,None,stand,,,True,0,0,,True,,,\"29,54\",\"29,54\",True,1\nBehavior,ch-transform-left,0.2,1.85,1.85,0,ch-trans-finish-left.gif,ch-trans-finish-left.gif,None,stand,,,True,0,0,,True,,,\"38,54\",\"38,54\",True,1\nBehavior,ch-transform-right1,0.2,1.85,1.85,0,ch-trans-finish-right.gif,ch-trans-finish-right.gif,None,trot,,,True,0,0,,True,,,\"29,54\",\"29,54\",True,1\nBehavior,ch-transform-left1,0.2,1.85,1.85,0,ch-trans-finish-left.gif,ch-trans-finish-left.gif,None,trot,,,True,0,0,,True,,,\"38,54\",\"38,54\",True,1\nBehavior,ch-transform-right2,0.2,1.85,1.85,0,ch-trans-finish-right.gif,ch-trans-finish-right.gif,None,flight,,,True,0,0,,True,,,\"29,54\",\"29,54\",True,1\nBehavior,ch-transform-left2,0.2,1.85,1.85,0,ch-trans-finish-left.gif,ch-trans-finish-left.gif,None,flight,,,True,0,0,,True,,,\"38,54\",\"38,54\",True,1\nBehavior,transform-twi-right,0.1,0.65,0.65,0,ch-trans-start-right.gif,ch-trans-start-right.gif,None,twi-transform-right,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,1\nBehavior,transform-twi-left,0.1,0.65,0.65,0,ch-trans-start-left.gif,ch-trans-start-left.gif,None,twi-transform-left,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,1\nBehavior,transform-aj-right,0.1,0.65,0.65,0,ch-trans-start-right.gif,ch-trans-start-right.gif,None,aj-transform-right,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,1\nBehavior,transform-aj-left,0.1,0.65,0.65,0,ch-trans-start-left.gif,ch-trans-start-left.gif,None,aj-transform-left,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,1\nBehavior,transform-rd-right,0.1,0.65,0.65,0,ch-trans-start-right.gif,ch-trans-start-right.gif,None,rd-transform-right,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,1\nBehavior,transform-rd-left,0.1,0.65,0.65,0,ch-trans-start-left.gif,ch-trans-start-left.gif,None,rd-transform-left,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,1\nBehavior,transform-ra-right,0.1,0.65,0.65,0,ch-trans-start-right.gif,ch-trans-start-right.gif,None,ra-transform-right,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,1\nBehavior,transform-ra-left,0.1,0.65,0.65,0,ch-trans-start-left.gif,ch-trans-start-left.gif,None,ra-transform-left,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,1\nBehavior,transform-fl-right,0.1,0.65,0.65,0,ch-trans-start-right.gif,ch-trans-start-right.gif,None,fl-transform-right,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,1\nBehavior,transform-fl-left,0.1,0.65,0.65,0,ch-trans-start-left.gif,ch-trans-start-left.gif,None,fl-transform-left,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,1\nBehavior,transform-pi-right,0.1,0.65,0.65,0,ch-trans-start-right.gif,ch-trans-start-right.gif,None,pi-transform-right,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,1\nBehavior,transform-pi-left,0.1,0.65,0.65,0,ch-trans-start-left.gif,ch-trans-start-left.gif,None,pi-transform-left,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,1\nBehavior,transform-twi-right1,0.1,0.65,0.65,0,ch-trans-start-right.gif,ch-trans-start-right.gif,None,twi-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,1\nBehavior,transform-twi-left1,0.1,0.65,0.65,0,ch-trans-start-left.gif,ch-trans-start-left.gif,None,twi-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,1\nBehavior,transform-aj-right1,0.1,0.65,0.65,0,ch-trans-start-right.gif,ch-trans-start-right.gif,None,aj-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,1\nBehavior,transform-aj-left1,0.1,0.65,0.65,0,ch-trans-start-left.gif,ch-trans-start-left.gif,None,aj-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,1\nBehavior,transform-rd-right1,0.1,0.65,0.65,0,ch-trans-start-right.gif,ch-trans-start-right.gif,None,rd-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,1\nBehavior,transform-rd-left1,0.1,0.65,0.65,0,ch-trans-start-left.gif,ch-trans-start-left.gif,None,rd-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,1\nBehavior,transform-ra-right1,0.1,0.65,0.65,0,ch-trans-start-right.gif,ch-trans-start-right.gif,None,ra-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,1\nBehavior,transform-ra-left1,0.1,0.65,0.65,0,ch-trans-start-left.gif,ch-trans-start-left.gif,None,ra-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,1\nBehavior,transform-fl-right1,0.1,0.65,0.65,0,ch-trans-start-right.gif,ch-trans-start-right.gif,None,fl-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,1\nBehavior,transform-fl-left1,0.1,0.65,0.65,0,ch-trans-start-left.gif,ch-trans-start-left.gif,None,fl-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,1\nBehavior,transform-pi-right1,0.1,0.65,0.65,0,ch-trans-start-right.gif,ch-trans-start-right.gif,None,pi-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,1\nBehavior,transform-pi-left1,0.1,0.65,0.65,0,ch-trans-start-left.gif,ch-trans-start-left.gif,None,pi-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,1\nBehavior,twi-transform-right,0.2,1.85,1.85,0,ch-twi-finish-right.gif,ch-twi-finish-right.gif,None,twi-stand,,,True,0,0,,True,,,\"55,48\",\"55,48\",True,2\nBehavior,twi-transform-left,0.2,1.85,1.85,0,ch-twi-finish-left.gif,ch-twi-finish-left.gif,None,twi-stand,,,True,0,0,,True,,,\"46,48\",\"46,48\",True,2\nBehavior,twi-transform-right1,0.2,1.85,1.85,0,ch-twi-finish-right.gif,ch-twi-finish-right.gif,None,twi-trot,,,True,0,0,,True,,,\"55,48\",\"55,48\",True,2\nBehavior,twi-transform-left1,0.2,1.85,1.85,0,ch-twi-finish-left.gif,ch-twi-finish-left.gif,None,twi-trot,,,True,0,0,,True,,,\"46,48\",\"46,48\",True,2\nBehavior,transform-twi-ch-right,0.07,0.65,0.65,0,ch-twi-start-right.gif,ch-twi-start-right.gif,None,ch-transform-right,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,2\nBehavior,transform-twi-ch-left,0.07,0.65,0.65,0,ch-twi-start-left.gif,ch-twi-start-left.gif,None,ch-transform-left,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,2\nBehavior,transform-twi-ch-right1,0.07,0.65,0.65,0,ch-twi-start-right.gif,ch-twi-start-right.gif,None,ch-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,2\nBehavior,transform-twi-ch-left1,0.07,0.65,0.65,0,ch-twi-start-left.gif,ch-twi-start-left.gif,None,ch-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,2\nBehavior,transform-twi-ch-right2,0.07,0.65,0.65,0,ch-twi-start-right.gif,ch-twi-start-right.gif,None,ch-transform-right2,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,2\nBehavior,transform-twi-ch-left2,0.07,0.65,0.65,0,ch-twi-start-left.gif,ch-twi-start-left.gif,None,ch-transform-left2,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,2\nBehavior,transform-twi-rd-right,0.01,0.65,0.65,0,ch-twi-start-right.gif,ch-twi-start-right.gif,None,rd-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,2\nBehavior,transform-twi-rd-left,0.01,0.65,0.65,0,ch-twi-start-left.gif,ch-twi-start-left.gif,None,rd-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,2\nBehavior,transform-twi-ra-right,0.01,0.65,0.65,0,ch-twi-start-right.gif,ch-twi-start-right.gif,None,ra-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,2\nBehavior,transform-twi-ra-left,0.01,0.65,0.65,0,ch-twi-start-left.gif,ch-twi-start-left.gif,None,ra-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,2\nBehavior,transform-twi-aj-right,0.01,0.65,0.65,0,ch-twi-start-right.gif,ch-twi-start-right.gif,None,aj-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,2\nBehavior,transform-twi-aj-left,0.01,0.65,0.65,0,ch-twi-start-left.gif,ch-twi-start-left.gif,None,aj-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,2\nBehavior,transform-twi-pi-right,0.01,0.65,0.65,0,ch-twi-start-right.gif,ch-twi-start-right.gif,None,pi-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,2\nBehavior,transform-twi-pi-left,0.01,0.65,0.65,0,ch-twi-start-left.gif,ch-twi-start-left.gif,None,pi-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,2\nBehavior,transform-twi-fl-right,0.01,0.65,0.65,0,ch-twi-start-right.gif,ch-twi-start-right.gif,None,fl-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,2\nBehavior,transform-twi-fl-left,0.01,0.65,0.65,0,ch-twi-start-left.gif,ch-twi-start-left.gif,None,fl-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,2\nBehavior,twi-stand,0.2,15,12,0,stand_twilight_right.gif,stand_twilight_left.gif,MouseOver,,,,False,0,0,,True,,,\"55,50\",\"42,50\",False,2\nBehavior,twi-trot,0.25,8,5,2.8,twilight_trot_right.gif,twilight_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"55,52\",\"42,52\",False,2\nBehavior,rd-transform-right,0.2,1.85,1.85,0,ch-rd-finish-right.gif,ch-rd-finish-right.gif,None,rd-stand,,,True,0,0,,True,,,\"55,52\",\"55,52\",True,3\nBehavior,rd-transform-left,0.2,1.85,1.85,0,ch-rd-finish-left.gif,ch-rd-finish-left.gif,None,rd-stand,,,True,0,0,,True,,,\"48,52\",\"48,52\",True,3\nBehavior,rd-transform-right1,0.2,1.85,1.85,0,ch-rd-finish-right.gif,ch-rd-finish-right.gif,None,rd-walk,,,True,0,0,,True,,,\"55,52\",\"55,52\",True,3\nBehavior,rd-transform-left1,0.2,1.85,1.85,0,ch-rd-finish-left.gif,ch-rd-finish-left.gif,None,rd-walk,,,True,0,0,,True,,,\"48,52\",\"48,52\",True,3\nBehavior,transform-rd-ch-right,0.07,0.65,0.65,0,ch-rd-start-right.gif,ch-rd-start-right.gif,None,ch-transform-right,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,3\nBehavior,transform-rd-ch-left,0.07,0.65,0.65,0,ch-rd-start-left.gif,ch-rd-start-left.gif,None,ch-transform-left,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,3\nBehavior,transform-rd-ch-right1,0.07,0.65,0.65,0,ch-rd-start-right.gif,ch-rd-start-right.gif,None,ch-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,3\nBehavior,transform-rd-ch-left1,0.07,0.65,0.65,0,ch-rd-start-left.gif,ch-rd-start-left.gif,None,ch-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,3\nBehavior,transform-rd-ch-right2,0.07,0.65,0.65,0,ch-rd-start-right.gif,ch-rd-start-right.gif,None,ch-transform-right2,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,3\nBehavior,transform-rd-ch-left2,0.07,0.65,0.65,0,ch-rd-start-left.gif,ch-rd-start-left.gif,None,ch-transform-left2,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,3\nBehavior,transform-rd-twi-right,0.01,0.65,0.65,0,ch-rd-start-right.gif,ch-rd-start-right.gif,None,twi-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,3\nBehavior,transform-rd-twi-left,0.01,0.65,0.65,0,ch-rd-start-left.gif,ch-rd-start-left.gif,None,twi-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,3\nBehavior,transform-rd-ra-right,0.01,0.65,0.65,0,ch-rd-start-right.gif,ch-rd-start-right.gif,None,ra-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,3\nBehavior,transform-rd-ra-left,0.01,0.65,0.65,0,ch-rd-start-left.gif,ch-rd-start-left.gif,None,ra-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,3\nBehavior,transform-rd-aj-right,0.01,0.65,0.65,0,ch-rd-start-right.gif,ch-rd-start-right.gif,None,aj-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,3\nBehavior,transform-rd-aj-left,0.01,0.65,0.65,0,ch-rd-start-left.gif,ch-rd-start-left.gif,None,aj-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,3\nBehavior,transform-rd-pi-right,0.01,0.65,0.65,0,ch-rd-start-right.gif,ch-rd-start-right.gif,None,pi-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,3\nBehavior,transform-rd-pi-left,0.01,0.65,0.65,0,ch-rd-start-left.gif,ch-rd-start-left.gif,None,pi-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,3\nBehavior,transform-rd-fl-right,0.01,0.65,0.65,0,ch-rd-start-right.gif,ch-rd-start-right.gif,None,fl-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,3\nBehavior,transform-rd-fl-left,0.01,0.65,0.65,0,ch-rd-start-left.gif,ch-rd-start-left.gif,None,fl-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,3\nBehavior,rd-stand,0.1,10,5,0,stand_rainbow_right.gif,stand_rainbow_left.gif,MouseOver,,,,False,0,0,,True,,,\"55,56\",\"42,56\",False,3\nBehavior,rd-walk,0.2,6,3,3.8,trotcycle_rainbow_right.gif,trotcycle_rainbow_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"54,55\",\"41,55\",False,3\nBehavior,rd-flyzoom,0.1,5,5,10,flyzoom_rainbow_right.gif,flyzoom_rainbow_left.gif,Diagonal_Only,,,,False,0,0,,True,,,\"64,44\",\"39,44\",False,3\nBehavior,aj-transform-right,0.2,1.85,1.85,0,ch-aj-finish-right.gif,ch-aj-finish-right.gif,None,aj-stand,,,True,0,0,,True,,,\"43,62\",\"43,62\",True,4\nBehavior,aj-transform-left,0.2,1.85,1.85,0,ch-aj-finish-left.gif,ch-aj-finish-left.gif,None,aj-stand,,,True,0,0,,True,,,\"46,62\",\"46,62\",True,4\nBehavior,aj-transform-right1,0.2,1.85,1.85,0,ch-aj-finish-right.gif,ch-aj-finish-right.gif,None,aj-walk,,,True,0,0,,True,,,\"43,62\",\"43,62\",True,4\nBehavior,aj-transform-left1,0.2,1.85,1.85,0,ch-aj-finish-left.gif,ch-aj-finish-left.gif,None,aj-walk,,,True,0,0,,True,,,\"46,62\",\"46,62\",True,4\nBehavior,transform-aj-ch-right,0.07,0.65,0.65,0,ch-aj-start-right.gif,ch-aj-start-right.gif,None,ch-transform-right,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,4\nBehavior,transform-aj-ch-left,0.07,0.65,0.65,0,ch-aj-start-left.gif,ch-aj-start-left.gif,None,ch-transform-left,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,4\nBehavior,transform-aj-ch-right1,0.07,0.65,0.65,0,ch-aj-start-right.gif,ch-aj-start-right.gif,None,ch-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,4\nBehavior,transform-aj-ch-left1,0.07,0.65,0.65,0,ch-aj-start-left.gif,ch-aj-start-left.gif,None,ch-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,4\nBehavior,transform-aj-ch-right2,0.07,0.65,0.65,0,ch-aj-start-right.gif,ch-aj-start-right.gif,None,ch-transform-right2,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,4\nBehavior,transform-aj-ch-left2,0.07,0.65,0.65,0,ch-aj-start-left.gif,ch-aj-start-left.gif,None,ch-transform-left2,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,4\nBehavior,transform-aj-twi-right,0.01,0.65,0.65,0,ch-aj-start-right.gif,ch-aj-start-right.gif,None,twi-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,4\nBehavior,transform-aj-twi-left,0.01,0.65,0.65,0,ch-aj-start-left.gif,ch-aj-start-left.gif,None,twi-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,4\nBehavior,transform-aj-rd-right,0.01,0.65,0.65,0,ch-aj-start-right.gif,ch-aj-start-right.gif,None,rd-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,4\nBehavior,transform-aj-rd-left,0.01,0.65,0.65,0,ch-aj-start-left.gif,ch-aj-start-left.gif,None,rd-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,4\nBehavior,transform-aj-ra-right,0.01,0.65,0.65,0,ch-aj-start-right.gif,ch-aj-start-right.gif,None,ra-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,4\nBehavior,transform-aj-ra-left,0.01,0.65,0.65,0,ch-aj-start-left.gif,ch-aj-start-left.gif,None,ra-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,4\nBehavior,transform-aj-pi-right,0.01,0.65,0.65,0,ch-aj-start-right.gif,ch-aj-start-right.gif,None,pi-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,4\nBehavior,transform-aj-pi-left,0.01,0.65,0.65,0,ch-aj-start-left.gif,ch-aj-start-left.gif,None,pi-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,4\nBehavior,transform-aj-fl-right,0.01,0.65,0.65,0,ch-aj-start-right.gif,ch-aj-start-right.gif,None,fl-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,4\nBehavior,transform-aj-fl-left,0.01,0.65,0.65,0,ch-aj-start-left.gif,ch-aj-start-left.gif,None,fl-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,4\nBehavior,aj-stand,0.35,10,2.2,0,stand_aj_right.gif,stand_aj_left.gif,MouseOver,,,,False,0,0,,True,,,\"43,64\",\"44,64\",False,4\nBehavior,aj-walk,0.35,5,2.2,3.3,trotcycle_aj_right.gif,trotcycle_aj_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"43,63\",\"44,63\",False,4\nBehavior,pi-transform-right,0.2,1.85,1.85,0,ch-pi-finish-right.gif,ch-pi-finish-right.gif,None,pinkie-stand,,,True,0,0,,True,,,\"75,62\",\"75,62\",True,5\nBehavior,pi-transform-left,0.2,1.85,1.85,0,ch-pi-finish-left.gif,ch-pi-finish-left.gif,None,pinkie-stand,,,True,0,0,,True,,,\"68,62\",\"68,62\",True,5\nBehavior,pi-transform-right1,0.2,1.85,1.85,0,ch-pi-finish-right.gif,ch-pi-finish-right.gif,None,pinkie-bounce,,,True,0,0,,True,,,\"75,62\",\"75,62\",True,5\nBehavior,pi-transform-left1,0.2,1.85,1.85,0,ch-pi-finish-left.gif,ch-pi-finish-left.gif,None,pinkie-bounce,,,True,0,0,,True,,,\"68,62\",\"68,62\",True,5\nBehavior,transform-pi-ch-right,0.07,0.65,0.65,0,ch-pi-start-right.gif,ch-pi-start-right.gif,None,ch-transform-right,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,5\nBehavior,transform-pi-ch-left,0.07,0.65,0.65,0,ch-pi-start-left.gif,ch-pi-start-left.gif,None,ch-transform-left,,,False,0,0,,True,,,\"66,68\",\"66,68\",True,5\nBehavior,transform-pi-ch-right1,0.07,0.65,0.65,0,ch-pi-start-right.gif,ch-pi-start-right.gif,None,ch-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,5\nBehavior,transform-pi-ch-left1,0.07,0.65,0.65,0,ch-pi-start-left.gif,ch-pi-start-left.gif,None,ch-transform-left1,,,False,0,0,,True,,,\"66,68\",\"66,68\",True,5\nBehavior,transform-pi-ch-right2,0.07,0.65,0.65,0,ch-pi-start-right.gif,ch-pi-start-right.gif,None,ch-transform-right2,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,5\nBehavior,transform-pi-ch-left2,0.07,0.65,0.65,0,ch-pi-start-left.gif,ch-pi-start-left.gif,None,ch-transform-left2,,,False,0,0,,True,,,\"66,68\",\"66,68\",True,5\nBehavior,transform-pi-twi-right,0.01,0.65,0.65,0,ch-pi-start-right.gif,ch-pi-start-right.gif,None,twi-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,5\nBehavior,transform-pi-twi-left,0.01,0.65,0.65,0,ch-pi-start-left.gif,ch-pi-start-left.gif,None,twi-transform-left1,,,False,0,0,,True,,,\"66,68\",\"66,68\",True,5\nBehavior,transform-pi-rd-right,0.01,0.65,0.65,0,ch-pi-start-right.gif,ch-pi-start-right.gif,None,rd-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,5\nBehavior,transform-pi-rd-left,0.01,0.65,0.65,0,ch-pi-start-left.gif,ch-pi-start-left.gif,None,rd-transform-left1,,,False,0,0,,True,,,\"66,68\",\"66,68\",True,5\nBehavior,transform-pi-aj-right,0.01,0.65,0.65,0,ch-pi-start-right.gif,ch-pi-start-right.gif,None,aj-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,5\nBehavior,transform-pi-aj-left,0.01,0.65,0.65,0,ch-pi-start-left.gif,ch-pi-start-left.gif,None,aj-transform-left1,,,False,0,0,,True,,,\"66,68\",\"66,68\",True,5\nBehavior,transform-pi-ra-right,0.01,0.65,0.65,0,ch-pi-start-right.gif,ch-pi-start-right.gif,None,ra-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,5\nBehavior,transform-pi-ra-left,0.01,0.65,0.65,0,ch-pi-start-left.gif,ch-pi-start-left.gif,None,ra-transform-left1,,,False,0,0,,True,,,\"66,68\",\"66,68\",True,5\nBehavior,transform-pi-fl-right,0.01,0.65,0.65,0,ch-pi-start-right.gif,ch-pi-start-right.gif,None,fl-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,5\nBehavior,transform-pi-fl-left,0.01,0.65,0.65,0,ch-pi-start-left.gif,ch-pi-start-left.gif,None,fl-transform-left1,,,False,0,0,,True,,,\"66,68\",\"66,68\",True,5\nBehavior,pinkie-stand,0.1,10,5,0,stand_pinkiepie_right.gif,stand_pinkiepie_left.gif,None,,,,False,0,0,,True,,,\"49,56\",\"46,56\",False,5\nBehavior,pinkie-walk,0.15,10,5,3,trotcycle_pinkiepie_right.gif,trotcycle_pinkiepie_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"49,64\",\"44,64\",False,5\nBehavior,pinkie-bounce,0.15,10,5,2,bounce_pinkiepie_right.gif,bounce_pinkiepie_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"59,98\",\"46,98\",False,5\nBehavior,pinkie-mouseover,0,5.2,2,0,mouse_pinkiepie_right.gif,mouse_pinkiepie_left.gif,MouseOver,,,,True,0,0,,True,,,\"49,62\",\"36,62\",False,5\nBehavior,pinkie-galopp,0.05,10,4,6,pinkie_galopp_right.gif,pinkie_galopp_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"81,52\",\"56,52\",False,5\nBehavior,ra-transform-right,0.2,1.85,1.85,0,ch-ra-finish-right.gif,ch-ra-finish-right.gif,None,rarity-stand,,,True,0,0,,True,,,\"53,52\",\"53,52\",True,6\nBehavior,ra-transform-left,0.2,1.85,1.85,0,ch-ra-finish-left.gif,ch-ra-finish-left.gif,None,rarity-stand,,,True,0,0,,True,,,\"48,52\",\"48,52\",True,6\nBehavior,ra-transform-right1,0.2,1.85,1.85,0,ch-ra-finish-right.gif,ch-ra-finish-right.gif,None,rarity-walk,,,True,0,0,,True,,,\"53,52\",\"53,52\",True,6\nBehavior,ra-transform-left1,0.2,1.85,1.85,0,ch-ra-finish-left.gif,ch-ra-finish-left.gif,None,rarity-walk,,,True,0,0,,True,,,\"48,52\",\"48,52\",True,6\nBehavior,transform-ra-ch-right,0.07,0.65,0.65,0,ch-ra-start-right.gif,ch-ra-start-right.gif,None,ch-transform-right,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,6\nBehavior,transform-ra-ch-left,0.07,0.65,0.65,0,ch-ra-start-left.gif,ch-ra-start-left.gif,None,ch-transform-left,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,6\nBehavior,transform-ra-ch-right1,0.07,0.65,0.65,0,ch-ra-start-right.gif,ch-ra-start-right.gif,None,ch-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,6\nBehavior,transform-ra-ch-left1,0.07,0.65,0.65,0,ch-ra-start-left.gif,ch-ra-start-left.gif,None,ch-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,6\nBehavior,transform-ra-ch-right2,0.07,0.65,0.65,0,ch-ra-start-right.gif,ch-ra-start-right.gif,None,ch-transform-right2,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,6\nBehavior,transform-ra-ch-left2,0.07,0.65,0.65,0,ch-ra-start-left.gif,ch-ra-start-left.gif,None,ch-transform-left2,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,6\nBehavior,transform-ra-twi-right,0.01,0.65,0.65,0,ch-ra-start-right.gif,ch-ra-start-right.gif,None,twi-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,6\nBehavior,transform-ra-twi-left,0.01,0.65,0.65,0,ch-ra-start-left.gif,ch-ra-start-left.gif,None,twi-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,6\nBehavior,transform-ra-rd-right,0.01,0.65,0.65,0,ch-ra-start-right.gif,ch-ra-start-right.gif,None,rd-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,6\nBehavior,transform-ra-rd-left,0.01,0.65,0.65,0,ch-ra-start-left.gif,ch-ra-start-left.gif,None,rd-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,6\nBehavior,transform-ra-aj-right,0.01,0.65,0.65,0,ch-ra-start-right.gif,ch-ra-start-right.gif,None,aj-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,6\nBehavior,transform-ra-aj-left,0.01,0.65,0.65,0,ch-ra-start-left.gif,ch-ra-start-left.gif,None,aj-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,6\nBehavior,transform-ra-pi-right,0.01,0.65,0.65,0,ch-ra-start-right.gif,ch-ra-start-right.gif,None,pi-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,6\nBehavior,transform-ra-pi-left,0.01,0.65,0.65,0,ch-ra-start-left.gif,ch-ra-start-left.gif,None,pi-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,6\nBehavior,transform-ra-fl-right,0.01,0.65,0.65,0,ch-ra-start-right.gif,ch-ra-start-right.gif,None,fl-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,6\nBehavior,transform-ra-fl-left,0.01,0.65,0.65,0,ch-ra-start-left.gif,ch-ra-start-left.gif,None,fl-transform-left1,,,False,0,0,,True,,,\"48,68\",\"48,68\",True,6\nBehavior,rarity-stand,0.2,14.24,14.24,0,stand_rarity_right.gif,stand_rarity_left.gif,MouseOver,,,,False,0,0,,True,,,\"53,54\",\"44,54\",False,6\nBehavior,rarity-walk,0.3,20,5,2.8,trotcycle_rarity_right.gif,trotcycle_rarity_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"55,54\",\"42,52\",False,6\nBehavior,fl-transform-right,0.2,1.85,1.85,0,ch-fl-finish-right.gif,ch-fl-finish-right.gif,None,flutter-stand,,,True,0,0,,True,,,\"53,48\",\"53,48\",True,7\nBehavior,fl-transform-left,0.2,1.85,1.85,0,ch-fl-finish-left.gif,ch-fl-finish-left.gif,None,flutter-stand,,,True,0,0,,True,,,\"54,48\",\"54,48\",True,7\nBehavior,fl-transform-right1,0.2,1.85,1.85,0,ch-fl-finish-right.gif,ch-fl-finish-right.gif,None,flutter-fly,,,True,0,0,,True,,,\"53,48\",\"53,48\",True,7\nBehavior,fl-transform-left1,0.2,1.85,1.85,0,ch-fl-finish-left.gif,ch-fl-finish-left.gif,None,flutter-fly,,,True,0,0,,True,,,\"54,48\",\"54,48\",True,7\nBehavior,transform-fl-ch-right,0.07,0.65,0.65,0,ch-fl-start-right.gif,ch-fl-start-right.gif,None,ch-transform-right,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,7\nBehavior,transform-fl-ch-left,0.07,0.65,0.65,0,ch-fl-start-left.gif,ch-fl-start-left.gif,None,ch-transform-left,,,False,0,0,,True,,,\"56,68\",\"56,68\",True,7\nBehavior,transform-fl-ch-right1,0.07,0.65,0.65,0,ch-fl-start-right.gif,ch-fl-start-right.gif,None,ch-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,7\nBehavior,transform-fl-ch-left1,0.07,0.65,0.65,0,ch-fl-start-left.gif,ch-fl-start-left.gif,None,ch-transform-left1,,,False,0,0,,True,,,\"56,68\",\"56,68\",True,7\nBehavior,transform-fl-ch-right2,0.07,0.65,0.65,0,ch-fl-start-right.gif,ch-fl-start-right.gif,None,ch-transform-right2,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,7\nBehavior,transform-fl-ch-left2,0.07,0.65,0.65,0,ch-fl-start-left.gif,ch-fl-start-left.gif,None,ch-transform-left2,,,False,0,0,,True,,,\"56,68\",\"56,68\",True,7\nBehavior,transform-fl-twi-right,0.01,0.65,0.65,0,ch-fl-start-right.gif,ch-fl-start-right.gif,None,twi-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,7\nBehavior,transform-fl-twi-left,0.01,0.65,0.65,0,ch-fl-start-left.gif,ch-fl-start-left.gif,None,twi-transform-left1,,,False,0,0,,True,,,\"56,68\",\"56,68\",True,7\nBehavior,transform-fl-rd-right,0.01,0.65,0.65,0,ch-fl-start-right.gif,ch-fl-start-right.gif,None,rd-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,7\nBehavior,transform-fl-rd-left,0.01,0.65,0.65,0,ch-fl-start-left.gif,ch-fl-start-left.gif,None,rd-transform-left1,,,False,0,0,,True,,,\"56,68\",\"56,68\",True,7\nBehavior,transform-fl-aj-right,0.01,0.65,0.65,0,ch-fl-start-right.gif,ch-fl-start-right.gif,None,aj-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,7\nBehavior,transform-fl-aj-left,0.01,0.65,0.65,0,ch-fl-start-left.gif,ch-fl-start-left.gif,None,aj-transform-left1,,,False,0,0,,True,,,\"56,68\",\"56,68\",True,7\nBehavior,transform-fl-ra-right,0.01,0.65,0.65,0,ch-fl-start-right.gif,ch-fl-start-right.gif,None,ra-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,7\nBehavior,transform-fl-ra-left,0.01,0.65,0.65,0,ch-fl-start-left.gif,ch-fl-start-left.gif,None,ra-transform-left1,,,False,0,0,,True,,,\"56,68\",\"56,68\",True,7\nBehavior,transform-fl-pi-right,0.01,0.65,0.65,0,ch-fl-start-right.gif,ch-fl-start-right.gif,None,pi-transform-right1,,,False,0,0,,True,,,\"61,68\",\"61,68\",True,7\nBehavior,transform-fl-pi-left,0.01,0.65,0.65,0,ch-fl-start-left.gif,ch-fl-start-left.gif,None,pi-transform-left1,,,False,0,0,,True,,,\"56,68\",\"56,68\",True,7\nBehavior,flutter-stand,0.1,15,10,0,stand_fluttershy_right.gif,stand_fluttershy_left.gif,None,,,,False,0,0,,True,,,\"57,48\",\"44,48\",False,7\nBehavior,flutter-mouseover,0,30,30,0,flutter_mouseover_right.gif,flutter_mouseover_left.gif,MouseOver,,,,True,0,0,,True,,,\"46,48\",\"49,48\",False,7\nBehavior,flutter-walk,0.25,15,5,2.5,trot_fluttershy_right.gif,trot_fluttershy_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"57,54\",\"44,54\",False,7\nBehavior,flutter-fly,0.15,10,5,2,fly_fluttershy_right.gif,fly_fluttershy_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"57,56\",\"46,56\",False,7\nEffect,\"Ch Twi right\",transform-twi-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch Twi left\",transform-twi-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch AJ right\",transform-aj-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch AJ left\",transform-aj-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch RD right\",transform-rd-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch RD left\",transform-rd-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch Ra right\",transform-ra-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch Ra left\",transform-ra-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch Fl right\",transform-fl-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch Fl left\",transform-fl-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch PP right\",transform-pi-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch PP left\",transform-pi-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch Twi right1\",transform-twi-right1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch Twi left1\",transform-twi-left1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch AJ right1\",transform-aj-right1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch AJ left1\",transform-aj-left1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch RD right1\",transform-rd-right1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch RD left1\",transform-rd-left1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch Ra right1\",transform-ra-right1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch Ra lef1t\",transform-ra-left1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch Fl right1\",transform-fl-right1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch Fl left1\",transform-fl-left1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch PP right1\",transform-pi-right1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ch PP left1\",transform-pi-left1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Twi Ch right\",transform-twi-ch-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Twi Ch left\",transform-twi-ch-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Twi Ch right1\",transform-twi-ch-right1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Twi Ch left1\",transform-twi-ch-left1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Twi Ch right2\",transform-twi-ch-right2,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Twi Ch left2\",transform-twi-ch-left2,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Twi RD right\",transform-twi-rd-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Twi RD left\",transform-twi-rd-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Twi Ra right\",transform-twi-ra-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Twi Ra left\",transform-twi-ra-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Twi AJ right\",transform-twi-aj-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Twi AJ left\",transform-twi-aj-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Twi PP right\",transform-twi-pi-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Twi PP left\",transform-twi-pi-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Twi Fl right\",transform-twi-fl-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Twi Fl left\",transform-twi-fl-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"RD Ch right\",transform-rd-ch-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"RD Ch left\",transform-rd-ch-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"RD Ch right1\",transform-rd-ch-right1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"RD Ch left1\",transform-rd-ch-left1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"RD Ch right2\",transform-rd-ch-right2,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"RD Ch left2\",transform-rd-ch-left2,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"RD Twi right\",transform-rd-twi-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"RD Twi left\",transform-rd-twi-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"RD Ra right\",transform-rd-ra-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"RD Ra left\",transform-rd-ra-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"RD AJ right\",transform-rd-aj-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"RD AJ left\",transform-rd-aj-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"RD PP right\",transform-rd-pi-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"RD PP left\",transform-rd-pi-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"RD Fl right\",transform-rd-fl-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"RD Fl left\",transform-rd-fl-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"AJ Ch right\",transform-aj-ch-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"AJ Ch left\",transform-aj-ch-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"AJ Ch right1\",transform-aj-ch-right1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"AJ Ch left1\",transform-aj-ch-left1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"AJ Ch right2\",transform-aj-ch-right2,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"AJ Ch left2\",transform-aj-ch-left2,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"AJ Twi right\",transform-aj-twi-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"AJ Twi left\",transform-aj-twi-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"AJ RD right\",transform-aj-rd-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"AJ RD left\",transform-aj-rd-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"AJ Ra right\",transform-aj-ra-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"AJ Ra left\",transform-aj-ra-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"AJ PP right\",transform-aj-pi-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"AJ PP left\",transform-aj-pi-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"AJ Fl right\",transform-aj-fl-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"AJ Fl left\",transform-aj-fl-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"PP Ch right\",transform-pi-ch-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"PP Ch left\",transform-pi-ch-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"PP Ch right1\",transform-pi-ch-right1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"PP Ch left1\",transform-pi-ch-left1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"PP Ch right2\",transform-pi-ch-right2,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"PP Ch left2\",transform-pi-ch-left2,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"PP Twi right\",transform-pi-twi-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"PP Twi left\",transform-pi-twi-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"PP RD right\",transform-pi-rd-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"PP RD left\",transform-pi-rd-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"PP AJ right\",transform-pi-aj-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"PP AJ left\",transform-pi-aj-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"PP Ra right\",transform-pi-ra-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"PP Ra left\",transform-pi-ra-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"PP Fl right\",transform-pi-fl-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"PP Fl left\",transform-pi-fl-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ra Ch right\",transform-ra-ch-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ra Ch left\",transform-ra-ch-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ra Ch right1\",transform-ra-ch-right1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ra Ch left1\",transform-ra-ch-left1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ra Ch right2\",transform-ra-ch-right2,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ra Ch left2\",transform-ra-ch-left2,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ra Twi right\",transform-ra-twi-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ra Twi left\",transform-ra-twi-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ra RD right\",transform-ra-rd-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ra RD left\",transform-ra-rd-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ra AJ right\",transform-ra-aj-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ra AJ left\",transform-ra-aj-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ra PP right\",transform-ra-pi-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ra PP left\",transform-ra-pi-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ra Fl right\",transform-ra-fl-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Ra Fl left\",transform-ra-fl-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Fl Ch right\",transform-fl-ch-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Fl Ch right2\",transform-fl-ch-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Fl Ch left\",transform-fl-ch-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Fl Ch left2\",transform-fl-ch-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Fl Ch right1\",transform-fl-ch-right1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Fl Ch left1\",transform-fl-ch-left1,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Fl Twi right\",transform-fl-twi-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Fl Twi left\",transform-fl-twi-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Fl RD right\",transform-fl-rd-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Fl RD left\",transform-fl-rd-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Fl AJ right\",transform-fl-aj-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Fl AJ left\",transform-fl-aj-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Fl Ra right\",transform-fl-ra-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Fl Ra left\",transform-fl-ra-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Fl PP right\",transform-fl-pi-right,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\nEffect,\"Fl PP left\",transform-fl-pi-left,transform-left.gif,transform-left.gif,1,0,Center,Center,Center,Center,True,True\n", "baseurl": "ponies/changeling/"},
                  {"ini": "Name,\"Cheerilee (80S)\"\nCategories,\"supporting ponies\",\"alternate art\",mares,\"earth ponies\"\nBehavior,stand,0.1,15,10,0,stand_80s_cherilee_right.gif,stand_80s_cherilee_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,fly,0.15,10,5,3,trotcycle_80s_cherilee_right.gif,trotcycle_80s_cherilee_left.gif,Diagonal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.25,15,5,3,trotcycle_80s_cherilee_right.gif,trotcycle_80s_cherilee_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Unnamed #1\",\"That's like, totally tubular!\",,False,0\nSpeak,\"Unnamed #2\",Radical!,,False,0\n", "baseurl": "ponies/cheerilee%20%2880s%29/"},
                  {"ini": "Name,Cheerilee\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.1,15,10,0,stand_cheerilee_right.gif,stand_cheerilee_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,fly,0.15,10,5,3,trotcycle_cheerilee_right.gif,trotcycle_cheerilee_left.gif,Diagonal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.25,15,5,3,trotcycle_cheerilee_right.gif,trotcycle_cheerilee_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Unnamed #1\",\"Honestly, that's how everypony was wearing their mane back then.\",,False,0\nSpeak,\"Unnamed #2\",\"Quiet down, please. We have an important lesson today!\",,False,0\n", "baseurl": "ponies/cheerilee/"},
                  {"ini": "Name,\"Cheese Sandwich\"\nCategories,\"supporting ponies\",stallions,\"earth ponies\"\nBehavior,stand,0.4,12,6,0,cheese-sandwich-idle-right.gif,cheese-sandwich-idle-left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,trot,0.5,12,5,3,cheese-sandwich-right.gif,cheese-sandwich-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,accordion,0.1,4,2,0,cheese-sandwich-accordion-right.gif,cheese-sandwich-accordion-left.gif,MouseOver,,\"Speech 2\",,False,0,0,,True,,,\"40,70\",\"40,70\",False,0,Fixed\nSpeak,\"Speech 1\",\"I happen to be the premiere party planner in all of Equestria.\",,False,0\nSpeak,\"Speech 2\",\"Come on, ponies! Who here likes to party?\",,True,0\nSpeak,\"Speech 3\",\"Hey, good looking! Want some mayonnaise?\",,False,0\nSpeak,\"Speech 4\",\"I was ready before I was born!\",,False,0\n", "baseurl": "ponies/cheese%20sandwich/"},
                  {"ini": "Name,\"Cherry Berry\"\nCategories,mares,\"earth ponies\",\"supporting ponies\"\nBehavior,stand,0.2,19,7,0,cherry_berry_stand_right.gif,cherry_berry_stand_left.gif,MouseOver,,,,False,0,0,,False,,,\"44,42\",\"0,0\",False,0,Fixed\nBehavior,\"trot blink\",0.2,17,5,3,cherry_berry_trot_right_blink.gif,cherry_berry_trot_left_blink.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,trot,0.14,18,5,3,cherry_berry_trot_right.gif,cherry_berry_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,sit,0.16,20,10,0,cherry_berry_sitting_right.gif,cherry_berry_sitting_left.gif,None,,,,False,0,0,,False,,,\"38,18\",\"38,18\",False,0,Fixed\nBehavior,sleep,0.03,40,15,0,cherry_berry_sleeping_right.gif,cherry_berry_sleeping_left.gif,Sleep,sit,,,False,0,0,,False,,,\"38,20\",\"38,20\",False,0,Fixed\nBehavior,pilot,0.05,18,7,3,cherryberry-pilot-right.gif,cherryberry-pilot-left.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"44,50\",\"43,50\",False,0,Fixed\nBehavior,balloon,0.03,18,7,0.5,cherry-balloon-right.gif,cherry-balloon-left.gif,All,,,,False,0,0,,False,,,\"151,400\",\"150,400\",False,0,Fixed\nBehavior,balloon_drag,0.01,18,10,0.5,cherry-balloon-right.gif,cherry-balloon-left.gif,Dragged,,,,True,0,0,,False,,,\"151,400\",\"150,400\",False,0,Fixed\nSpeak,Yuck!,\"I can't get the taste off my tongue!\",{\"can't get the taste off my tongue!.mp3\",\"can't get the taste off my tongue!.ogg\"},False,0\nSpeak,Acting,\"Showpony business is tough.\",{\"showpony business is tough.mp3\",\"showpony business is tough.ogg\"},False,0\nSpeak,EASY!,\"Auh! .Easy does it, lady!\",{\"easy does it lady!.mp3\",\"easy does it lady!.ogg\"},False,0\nSpeak,sp-spiders,\"Try to land the sp-sp-spiders on the web.\",{\"try to land the spiders on the web.mp3\",\"try to land the spiders on the web.ogg\"},False,0\n", "baseurl": "ponies/cherry%20berry/"},
                  {"ini": "Name,Cloudchaser\nCategories,\"supporting ponies\",mares,pegasi\nBehavior,stand,0.2,14,10,0,stand_cloudchaser_right.gif,stand_cloudchaser_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,trot,0.15,12,6,3,trotcycle_cloudchaser_right.gif,trotcycle_cloudchaser_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"trot wing\",0.15,12,6,3,trotcycle_cloudchaser_wing_right.gif,trotcycle_cloudchaser_wing_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"stand wing\",0.2,14,10,0,stand_cloudchaser_wing_right.gif,stand_cloudchaser_wing_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"trot wing blink\",0.4,24,15,3,trotcycle_cloudchaser_wing_right_blinking.gif,trotcycle_cloudchaser_wing_left_blinking.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"trot blink\",0.3,24,15,3,trotcycle_cloudchaser_right_blinking.gif,trotcycle_cloudchaser_left_blinking.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,follow,0.15,20,14,3,trotcycle_cloudchaser_wing_right_blinking.gif,trotcycle_cloudchaser_wing_left_blinking.gif,All,,follow,later,False,50,0,Flitter,False,\"stand wing\",\"trot wing blink\",\"0,0\",\"0,0\",False,0,Fixed\nBehavior,fly,0.3,20,15,5,cloudchaser_fly_right.gif,cloudchaser_fly_left.gif,All,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,hover,0.1,10,7,2,cloudchaser_fly_right.gif,cloudchaser_fly_left.gif,Vertical_Only,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,sit,0.1,17,12,0,cloudchaser_sit_right.gif,cloudchaser_sit_left.gif,None,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,sleep,0.08,40,35,0,cloudchaser_sleep_right.gif,cloudchaser_sleep_left.gif,Sleep,sit,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"nice flexibility\",0.1,20,16,0,cloudchaser_stretch_right.gif,cloudchaser_stretch_left.gif,None,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,training,0,17,17,0,cloudchaser_stretch_right.gif,cloudchaser_stretch_left.gif,None,,,,True,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nSpeak,machine?,\"What exactly does this machine do?\",{\"what exactly does this machine do.mp3\",\"what exactly does this machine do.ogg\"},False,0\nSpeak,\"without you\",\"We couldn't have done it without you.\",{\"we couldn't've done it without you.mp3\",\"we couldn't've done it without you.ogg\"},False,0\nSpeak,follow,\"Yo sis! Over here!\",,True,0\nSpeak,later,\"Catch ya later sis!\",,True,0\n", "baseurl": "ponies/cloudchaser/"},
                  {"ini": "Name,\"Cloud Kicker\"\nCategories,mares,pegasi,\"supporting ponies\"\nBehavior,Idle,0.2,6,2,0,idle_right.gif,idle_left.gif,None,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,Trot,0.5,12,4,3,trotcycle_right.gif,trotcycle_left.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,Flyring,0.3,10,4,3,flying_right.gif,flying_left.gif,All,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,\"Derp Drag\",0,60,60,0,derp_face_right.gif,derp_face_left.gif,Dragged,,,,True,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,\"Derp Mouse\",0,60,60,0,derp_face_right.gif,derp_face_left.gif,MouseOver,,,,True,0,0,,False,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/cloud%20kicker/"},
                  {"ini": "Name,\"Coco Pommel\"\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.15,15,10,0,stand_coco_right.gif,stand_coco_left.gif,MouseOver,,,,False,0,0,,True,,,\"39,36\",\"41,36\",False,0\nBehavior,fly,0.15,10,5,3,trot_coco_right.gif,trot_coco_left.gif,Diagonal_Only,,,,False,0,0,,True,,,\"39,42\",\"41,42\",False,0\nBehavior,walk,0.25,15,5,3,trot_coco_right.gif,trot_coco_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"39,42\",\"41,42\",False,0\nBehavior,Sew,0.15,16,5,0,coco_sew_right.gif,coco_sew_left.gif,None,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/coco%20pommel/"},
                  {"ini": "Name,Colgate\nCategories,\"supporting ponies\",mares,unicorns\nBehavior,stand,0.4,15,3,0,colgate_stand_right.gif,colgate_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.4,15,3,2,colgate_walk_right.gif,colgate_walk_left.gif,Diagonal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,brushie,0.2,15,5,0,colgate_stretch_right.gif,colgate_stretch_left.gif,None,,brushie_speak,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,sitting,0.2,45,30,0,colgate_sit_right.gif,colgate_sit_left.gif,Sleep,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nEffect,brush,brushie,colgate_brush_right.gif,colgate_brush_left.gif,0,0,Right,Bottom_Right,Left,Bottom_Left,True,False\nSpeak,brushie_speak,\"Brushie brushie brushie brushie!\",,False,0\n", "baseurl": "ponies/colgate/"},
                  {"ini": "Name,Daisy\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.33,20,15,0,daisy_stand_right.gif,daisy_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.33,20,15,2,daisy_trot_right.gif,daisy_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,blink,0.1,20,15,0,daisy_blink_right.gif,daisy_blink_left.gif,None,,,,False,0,0,\"Sir Colton Vines\",False,blink,trot,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/daisy/"},
                  {"ini": "Name,\"Daring Do\"\nCategories,\"supporting ponies\",mares,pegasi\nBehavior,Standing,0.5,5,2,0,standingright.gif,standingleft.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,Trotting,0.5,10,3,3,trotcycle_daringdo_right.gif,trotcycle_daringdo_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,Flying,0.3,10,4,3,fly_right.gif,fly_left.gif,All,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,daring_paradox_start,0.5,4,4,0,standingright.gif,standingleft.gif,None,daring_paradox_end,,,True,0,0,\"A.K. Yearling\",False,Standing,Trotting,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,daring_paradox_end,0.5,7,6,0,standingright.gif,standingleft.gif,None,,\"Paradox #1\",\"Paradox #2\",True,0,0,\"A.K. Yearling\",False,Standing,Trotting,\"0,0\",\"0,0\",False,0,Fixed\nSpeak,\"Speech #1\",\"Another day, another dungeon.\",,False,0\nSpeak,\"Speech #2\",\"I prefer to work alone.\",,False,0\nSpeak,\"Paradox #1\",\"Yeah, that's not something you see every day!\",,True,0\nSpeak,\"Paradox #2\",\"(That's the first time I've seen somepony cosplay my alter ego. Neat.)\",,True,0\n", "baseurl": "ponies/daring%20do/"},
                  {"ini": "Name,Davenport\nCategories,\"supporting ponies\",stallions,\"earth ponies\"\nBehavior,stand,0.5,20,7.52,0,stand_right.gif,stand_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,trot,0.5,20,10,3,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nSpeak,quill,\"Want to buy a quill?\",,False,0\nSpeak,sofa,\"Want to buy a sofa?\",,False,0\nSpeak,sorry,\"Sorry, I'm out of quills!\",,False,0\nSpeak,sorry2,\"Sorry, I'm out of sofas!\",,False,0\n", "baseurl": "ponies/davenport/"},
                  {"ini": "Name,\"Derpy Hooves\"\nCategories,pegasi,mares,\"supporting ponies\"\nBehavior,stand,0.2,12.66,12.66,0,derpy_stand_right.gif,derpy_stand_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,stand_wing,0.1,12.66,12.66,0,derpy_stand_wing_right.gif,derpy_stand_wing_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,sleep,0,45,20,0,derpy_sleep_right.gif,derpy_sleep_left.gif,Sleep,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.25,20,5,3,derpy_walking_right.gif,derpy_walking_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk_wing,0.15,20,5,3,derpy_walking_wing_right.gif,derpy_walking_wing_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,fly,0.35,20,5,3,derpy_fly_right.gif,derpy_fly_left.gif,Diagonal_Vertical,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,hover_still,0.2,20,5,0,derpy_hover_right.gif,derpy_hover_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,fly_derp,0.2,20,5,3,derpy_flyupsidedown_right.gif,derpy_flyupsidedown_left.gif,Diagonal_Vertical,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,hover_derp,0.2,20,5,2,derpy_hoverupsidedown_right.gif,derpy_hoverupsidedown_left.gif,Vertical_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,grab_mail,0.15,2.88,2.88,0,derpy_grabmail_right.gif,derpy_grabmail_left.gif,None,fly_mail_1,mail,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,fly_mail_1,0,5,2,3,derpy_mail_right.gif,derpy_mail_left.gif,Diagonal_Only,fly_mail_2,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,fly_mail_2,0,5,2,3,derpy_mail_right.gif,derpy_mail_left.gif,Diagonal_horizontal,fly_mail_3,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,fly_mail_3,0,5,2,3,derpy_mail_right.gif,derpy_mail_left.gif,Diagonal_horizontal,putaway_mail,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,putaway_mail,0,1.96,1.96,0,derpy_putawaymail_right.gif,derpy_putawaymail_left.gif,None,,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,muffin,0.2,6.52,6.52,0,derpy_muffin_right.gif,derpy_muffin_left.gif,None,,muffin,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,follow,0.2,60,30,3,derpy_walking_right.gif,derpy_walking_left.gif,All,,Hello,,False,100,100,Raindrops,True,,,\"0,0\",\"0,0\",False,0\nBehavior,Sit,0.2,38.24,19.12,0,derpy_sit_left_short.gif,derpy_sit_right_short.gif,Sleep,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,Drag,0,60,60,0,drag_right.png,drag_left.png,Dragged,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,cloud_start,0.25,5.26,5.26,0,derpy_cloud_start_right.gif,derpy_cloud_start_left.gif,None,cloud_bounce,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,cloud_bounce,0.25,8.65,8.65,0,derpy_cloud_right.gif,derpy_cloud_left.gif,None,,wrong,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nEffect,drop_mail1,fly_mail_1,mail_right.gif,mail_left.gif,5,1,Center,Center,Center,Center,False,False\nEffect,drop_mail2,fly_mail_2,mail_right.gif,mail_left.gif,5,1,Center,Center,Center,Center,False,False\nEffect,drop_mail3,fly_mail_3,mail_right.gif,mail_left.gif,5,1,Center,Center,Center,Center,False,False\nSpeak,\"Unnamed #1\",Muffins!,,False,0\nSpeak,\"Unnamed #2\",Muffins?,,False,0\nSpeak,\"Unnamed #3\",Muffins...,,False,0\nSpeak,\"Unnamed #4\",Muffins.,,False,0\nSpeak,mail,\"Derpy Delivery!\",,True,0\nSpeak,Hello,\"Hi, Raindrops!\",,True,0\nSpeak,muffin,Muffin!,{muffin.mp3,muffin.ogg},False,0\nSpeak,Wrong,\"I just don't know what went wrong!\",{wrong.mp3,wrong.ogg},True,0\n", "baseurl": "ponies/derpy%20hooves/"},
                  {"ini": "Name,\"Diamond Mint\"\nCategories,\"supporting ponies\",mares,unicorns\nBehavior,idle,0.5,20,15,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,galatrot,0.2,15,7,2,galatrot_right.gif,galatrot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.5,20,15,2,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,Gala,\"\u201cAt the Gala\u201d\",,False,0\n", "baseurl": "ponies/diamond%20mint/"},
                  {"ini": "Name,\"Diamond Tiara\"\nCategories,\"supporting ponies\",fillies,\"earth ponies\"\nBehavior,stand,0.25,20,15,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"32,39\",\"32,39\",False,0,Fixed\nBehavior,trot,0.25,25,20,2,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"33,46\",\"32,46\",False,0,Fixed\nBehavior,scoff,0.15,7.5,7.5,0,scoff_right.gif,scoff_left.gif,None,,blankflank,,False,0,0,,True,,,\"32,40\",\"32,40\",False,0,Fixed\nBehavior,bump_left,0,3,3,2,trot_right.gif,trot_left.gif,All,bump_left-1,,,True,38,2,\"Silver Spoon\",True,,,\"33,46\",\"32,46\",True,0,Fixed\nBehavior,bump_right,0,3,3,2,trot_right.gif,trot_left.gif,All,bump_right-1,,,True,-38,2,\"Silver Spoon\",True,,,\"33,46\",\"32,46\",True,0,Fixed\nBehavior,bump_left-1,0.15,2.5,2.5,0,bump-left.gif,bump-left.gif,None,,bump,,True,0,0,,True,,,\"92,47\",\"92,47\",True,0,Fixed\nBehavior,bump_right-1,0.15,2.5,2.5,0,bump-right.gif,bump-right.gif,None,,bump,,True,0,0,,True,,,\"32,47\",\"32,47\",True,0,Fixed\nSpeak,BlankFlank,\"Blank Flank!\",,True,0\nSpeak,Bump,\"Bump, bump, sugar-lump rump!\",,True,0\n", "baseurl": "ponies/diamond%20tiara/"},
                  {"ini": "Name,\"Dinky Hooves\"\nCategories,\"supporting ponies\",fillies,unicorns\nBehavior,idle,0.3,20,15,0,dinky-idle-right.gif,dinky-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,trot,0.3,20,15,2,dinky_trot_r.gif,dinky_trot_l.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,follow_derpy,0.3,60,30,2,dinky_trot_r.gif,dinky_trot_l.gif,All,,,,False,78,0,\"Derpy Hooves\",True,,,\"0,0\",\"0,0\",False,0,Fixed\n", "baseurl": "ponies/dinky%20hooves/"},
                  {"ini": "Name,Discord\nCategories,non-ponies,\"supporting ponies\",stallions\nBehavior,stand,0.1,15,12,0,discord_shuffle_right.gif,discord_shuffle_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.15,10,5,3,discord_walk_right.gif,discord_walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,skate,0.15,10,5,3,discord_skate_right.gif,discord_skate_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,Discorded,0,7.5,7.5,3,discord_puppet.gif,discord_puppet.gif,None,,puppet,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nEffect,raincloud,stand,chocolateraincloud.gif,chocolateraincloud.gif,0,200,Top_Right,Center,Top_Right,Center,False,False\nSpeak,\"Unnamed #1\",\"Wahaha this is going to be fun*\",,False,0\nSpeak,\"Unnamed #2\",\"Do you want some Chaos?\",,False,0\nSpeak,puppet,\"I think you ponies have gone on with this for far too long\",,True,0\n", "baseurl": "ponies/discord/"},
                  {"ini": "Name,\"Doctor Whooves (Fan Character)\"\nCategories,\"earth ponies\",stallions,\"supporting ponies\",\"alternate art\"\nBehavior,stand,0.25,15,2,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"39,47\",\"44,47\",False,0,Fixed\nBehavior,idle,0.25,15,5,0,idle_right.gif,idle_left.gif,None,,,,False,0,0,,True,,,\"37,47\",\"44,47\",False,0,Fixed\nBehavior,walk,0.25,15,3,3,walking_right.gif,walking_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"57,61\",\"46,61\",False,0,Fixed\nBehavior,\"walk tardis\",0.05,15,6,3,walking_right.gif,walking_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"56,61\",\"47,61\",False,0,Fixed\nBehavior,fez,0.05,15,5,0,fez_right.gif,fez_left.gif,None,,,,False,0,0,,True,,,\"39,58\",\"44,58\",False,0,Fixed\nEffect,TARDIS,\"walk tardis\",tardis1.gif,tardis1.gif,7,0,Bottom_Left,Bottom,Bottom_Right,Bottom,False,True\nSpeak,\"Unnamed #1\",Fantastic!,,False,0\nSpeak,\"Unnamed #2\",Allons-y!,,False,0\nSpeak,\"Unnamed #3\",\"Don't mind me, off to save time and space.\",,False,0\nSpeak,\"Unnamed #4\",\"Trust me. I'm the Doctor.\",,False,0\nSpeak,\"Soundboard #1\",\"Eh, no thanks.\",{\"eh, no thanks.mp3\",\"eh, no thanks.ogg\"},False,0\nSpeak,\"Soundboard #2\",\"Would you please leave me alone!\",{\"would you please leave me alone.mp3\",\"would you please leave me alone.ogg\"},False,0\n", "baseurl": "ponies/doctor%20whooves%20%28fan%20character%29/"},
                  {"ini": "Name,\"Doctor Whooves\"\nCategories,\"supporting ponies\",stallions,\"earth ponies\"\nBehavior,stand,0.25,10,2,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"40,41\",\"33,41\",False,0,Fixed\nBehavior,walk,0.25,10,3,3,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"57,54\",\"48,54\",False,0,Fixed\nBehavior,\"walk tardis\",0.02,10,6,3,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"57,54\",\"48,54\",False,0,Fixed\nBehavior,hourglass,0.1,10.8,8,0,hourglass_right.gif,hourglass_left.gif,None,,,,False,0,0,,True,,,\"40,57\",\"85,57\",False,0,Fixed\nBehavior,\"clone stand\",0.2,10,2,0,clone_idle_right.gif,clone_idle_left.gif,None,,,,False,0,0,,True,,,\"40,41\",\"37,41\",False,0,Fixed\nBehavior,\"clone walk\",0.2,10,3,3,clone_trot_right.gif,clone_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"42,48\",\"37,48\",False,0,Fixed\nEffect,TARDIS,\"walk tardis\",tardis1.gif,tardis1.gif,7,0,Bottom_Left,Bottom,Bottom_Right,Bottom,False,True\nSpeak,\"Unnamed #1\",Fantastic!,,False,0\nSpeak,\"Unnamed #2\",Allons-y!,,False,0\nSpeak,\"Unnamed #3\",\"Don't mind me, off to save time and space.\",,False,0\nSpeak,\"Unnamed #4\",\"Trust me. I'm the Doctor.\",,False,0\nSpeak,\"Soundboard #1\",\"Eh, no thanks.\",{\"eh, no thanks.mp3\",\"eh, no thanks.ogg\"},False,0\nSpeak,\"Soundboard #2\",\"Would you please leave me alone!\",{\"would you please leave me alone.mp3\",\"would you please leave me alone.ogg\"},False,0\n", "baseurl": "ponies/doctor%20whooves/"},
                  {"ini": "Name,Donny\nCategories,stallions,\"earth ponies\",\"supporting ponies\"\nBehavior,stand,0.2,15,3,0,donny-idle-right.gif,donny-idle-left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walking,0.35,15,5,2,donny-trot-right.gif,donny-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Speech #1\",\"I'm the walrus!\",,False,0", "baseurl": "ponies/donny/"},
                  {"ini": "Name,\"Donut Joe\"\nCategories,\"supporting ponies\",stallions,unicorns\nBehavior,stand,0.25,18,10,0,donutjoe_idle_right.gif,donutjoe_idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.25,10,8,3,donutjoe_trot_right.gif,donutjoe_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/donut%20joe/"},
                  {"ini": "Name,\"Dr. Caballeron\"\nCategories,\"supporting ponies\",stallions,\"earth ponies\"\nBehavior,idle,0.33,10,5,0,caballeron-idle-right.gif,caballeron-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.33,12,5,3,caballeron-right.gif,caballeron-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Speech #1\",\"That's Doctor Caballeron to you!\",{drcaballeron.mp3,drcaballeron.ogg},False,0\nSpeak,\"Speech #2\",\"Sounds like we have a deal.\",{deal.mp3,deal.ogg},False,0\n", "baseurl": "ponies/dr.%20caballeron/"},
                  {"ini": "Name,Dude\nCategories,stallions,\"earth ponies\",\"supporting ponies\"\nBehavior,stand,0.2,15,3,0,dude-idle-right.gif,dude-idle-left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walking,0.35,15,5,2,dude-trot-right.gif,dude-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Speech #1\",\"I'm the Dude.\",,False,0\nSpeak,\"Speech #2\",\"The rug really tied the room together.\",,False,0\nSpeak,\"Speech #3\",\"The Dude abides.\",,False,0", "baseurl": "ponies/dude/"},
                  {"ini": "Name,Elsie\nCategories,\"supporting ponies\",\"earth ponies\",mares\nBehavior,stand,0.45,15,10,0,stand_right.png,stand_left.png,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.45,15,10,2,walk_normal_right.gif,walk_normal_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk_camera,0.15,15,10,2,walk_camera_right.gif,walk_camera_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,photo_shoot_start,0,30,30,5,speed_walk_right.gif,speed_walk_left.gif,All,get_in_position_fluttershy,,,True,0,0,\"Photo Finish\",True,,,\"0,0\",\"0,0\",False,0\nBehavior,get_in_position_fluttershy,0,30,30,5,speed_walk_camera_right.gif,speed_walk_camera_left.gif,All,deploy_camera,,,True,-104,0,Fluttershy,True,,,\"0,0\",\"0,0\",False,0\nBehavior,deploy_camera,0,1.7,1.7,0,camera_place.gif,camera_place.gif,None,move_away,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,move_away,0,15,15,3,walk_normal_right.gif,walk_normal_left.gif,All,follow_photo,,,True,-149,-149,\"Photo Finish\",True,,,\"0,0\",\"0,0\",False,0\nBehavior,follow_photo,1,15,15,3,walk_normal_right.gif,walk_normal_left.gif,All,,,,True,0,0,\"Photo Finish\",True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/elsie/"},
                  {"ini": "Name,Fancypants\nCategories,\"supporting ponies\",unicorns,stallions\nBehavior,stand,0.25,8,6,0,fancy_blink5_right_8.gif,fancy_blink5_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.25,8,6,1,fancy_walk_right_8.gif,fancy_walk_left_8.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,Flottosho,0,6,6,0,fancy_blink_right.gif,fancy_blink_left.gif,None,,fluttershy,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,Rarara,0,6,6,0,fancy_blink_right.gif,fancy_blink_left.gif,None,,rarity,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"Ponko poe\",0,6,6,0,fancy_blink_right.gif,fancy_blink_left.gif,None,,\"pinky pie\",,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,RonboDosh,0,6,6,0,fancy_blink_right.gif,fancy_blink_left.gif,None,,rainbowdash,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,Applojock,0,6,6,0,fancy_blink_right.gif,fancy_blink_left.gif,None,,applejack,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,Twologht,0,6,6,0,fancy_blink_right.gif,fancy_blink_left.gif,None,,twilight,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,Fluttershy,\"Why hello there miss Fluttershy. It is always a pleasure to see you here.\",,True,0\nSpeak,Rarity,\"Rarity! jolly good to see you! Glad you could make it, on this desktop.\",,True,0\nSpeak,\"Pinky Pie\",\"I say, my dear Pinky Pie, you are quite a cheerful one. What would a desktop be without you.\",,True,0\nSpeak,RainbowDash,\"RainbowDash, the wonderbolt trainer! What an honor. Thank you for indulging us with your presence\",,True,0\nSpeak,AppleJack,\"Quite a good shape as always, my sweet Applejack. Welcome to this wonderful desktop. I hope you will have a great time.\",,True,0\nSpeak,Twilight,\"My my isn't it Twilight Sparkle? Celestia's most brilliant student. What kind of book will you treat us this time.\",,True,0\n", "baseurl": "ponies/fancypants/"},
                  {"ini": "Name,Featherweight\nCategories,\"supporting ponies\",colts,pegasi\nBehavior,stand,0.25,20,10,0,featherweight-idle-right.gif,featherweight-idle-left.gif,MouseOver,,,,False,0,0,,False,,,\"29,38\",\"28,38\",False,0,Fixed\nBehavior,trot,0.2,26,8,2.5,featherweight-trot-right.gif,featherweight-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"29,44\",\"28,44\",False,0,Fixed\nBehavior,fly,0.15,10,5,2.2,featherweight-fly-right.gif,featherweight-fly-left.gif,All,,,,False,0,0,,False,,,\"30,44\",\"29,44\",False,0,Fixed\nSpeak,Bro!,\"Free Foal Press. I'll document everything!\",,False,0\nSpeak,bye,\"This could make a great photo.\",,False,0\n", "baseurl": "ponies/featherweight/"},
                  {"ini": "Name,Fiddlesticks\nCategories,mares,\"earth ponies\",\"supporting ponies\"\nBehavior,stand,0.5,20,8,0,fiddlesticks-idle-right.gif,fiddlesticks-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"53,57\",\"48,57\",False,0\nBehavior,walk,0.5,15,7,2.5,fiddlesticks-trot-right.gif,fiddlesticks-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"53,62\",\"48,62\",False,0\nBehavior,pose,0.1,15,6,0,fiddlesticks-pose-right.gif,fiddlesticks-pose-left.gif,None,,,,False,0,0,,True,,,\"39,75\",\"53,75\",False,0\nSpeak,\"Speech 1\",\"Raise this barn, raise this barn, 1 2 3 4... \u266b\",,False,0\nSpeak,\"Speech 2\",\u266a,,False,0\n", "baseurl": "ponies/fiddlesticks/"},
                  {"ini": "Name,Fido\nCategories,non-ponies,stallions,\"supporting ponies\"\nBehavior,stand,0.25,20,8,0,fido_idle_right.gif,fido_idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk_normal,0.25,25,20,2,fido_walk_right.gif,fido_walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,threat,0.25,8,6,2,fido_treat_right.gif,fido_treat_left.gif,All,,,,True,0,0,Rarity,False,stand,threat,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk_rover,1,20,6,2.15,fido_walk_right.gif,fido_walk_left.gif,All,,,,False,0,-40,Rover,False,stand,walk_normal,\"0,0\",\"0,0\",False,0,Fixed\n", "baseurl": "ponies/fido/"},
                  {"ini": "Name,\"Filthy Rich\"\nCategories,stallions,\"earth ponies\",\"supporting ponies\"\nBehavior,Stand,0.5,25,15,0,filthy_rich_standing_right.gif,filthy_rich_standing_left.gif,MouseOver,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,Trot,0.5,20,2,1.1,filthy_rich_trot_right.gif,filthy_rich_trot_left.gif,All,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/filthy%20rich/"},
                  {"ini": "Name,Flam\nCategories,\"supporting ponies\",stallions,unicorns\nBehavior,stand,0.5,30,20,0,flam_idle_right.gif,flam_idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,trot,0.5,20,15,2,flam_trot_right.gif,flam_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"43,55\",\"42,55\",False,0,Fixed\n", "baseurl": "ponies/flam/"},
                  {"ini": "Name,\"Flash Sentry\"\nCategories,stallions,pegasi,\"supporting ponies\"\nBehavior,stand,0.3,15,5,0,flashsentry-idle-right.gif,flashsentry-idle-left.gif,None,,,,False,0,0,,True,,,\"44,53\",\"32,53\",False,0\nBehavior,walk,0.4,15,7,2.4,flashsentry-trot-right.gif,flashsentry-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"42,53\",\"32,53\",False,0\nBehavior,flight,0.4,10,5,3.4,flashsentry-flight-right.gif,flashsentry-flight-left.gif,All,,,,False,0,0,,True,,,\"44,51\",\"32,51\",False,0\nSpeak,\"Speech 1\",\"Oh, hi.\",,False,0\nSpeak,\"Speech 2\",\"We should really stop bumping into each other.\",,False,0\n", "baseurl": "ponies/flash%20sentry/"},
                  {"ini": "Name,Fleetfoot\nCategories,\"supporting ponies\",mares,pegasi\nbehaviorgroup,1,Normal\nbehaviorgroup,2,\"Wonderbolt Uniform\"\nBehavior,stand,0.2,10,3,0,fleetfoot-idle-right.gif,fleetfoot-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"43,46\",\"0,0\",False,1,Fixed\nBehavior,fly,0.15,4,1,3,fleetfoot-fly-right.gif,fleetfoot-fly-left.gif,Vertical_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,dash,0.25,8,2,5,fleetfoot-fly-right.gif,fleetfoot-fly-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,walk,0.2,10,3,3,fleetfoot-right.gif,fleetfoot-left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,glasses,0.1,8,4,3,fleetfoot-glasses-right.gif,fleetfoot-glasses-left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,bigmac-start,0.05,2.5,2.5,0,fleetfoot-love-right.gif,fleetfoot-love-left.gif,None,bigmac-follow,\"BigMac #1\",,False,-10,20,\"Big McIntosh\",False,bigmac-start,bigmac-start,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,bigmac-follow,0.25,30,10,3,fleetfoot-heart-right.gif,fleetfoot-heart-left.gif,Diagonal_horizontal,bigmac-end,\"BigMac #2\",,True,-10,20,\"Big McIntosh\",False,bigmac-start,bigmac-follow,\"51,50\",\"58,50\",False,1,Fixed\nBehavior,bigmac-end,0.1,8,8,0,fleetfoot-embarrassed-right.gif,fleetfoot-embarrassed-left.gif,None,,,,True,0,0,,True,,,\"0,0\",\"0,0\",True,1,Fixed\nBehavior,get-dressed,0.02,8,4,3,fleetfoot-glasses-right.gif,fleetfoot-glasses-left.gif,Horizontal_Only,uniform_stand,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,uniform_stand,0.2,10,3,0,fleetfoot-wonderbolt-idle-right.gif,fleetfoot-wonderbolt-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"42,46\",False,2,Fixed\nBehavior,uniform_fly,0.15,4,1,3,fleetfoot-wonderbolt-fly-right.gif,fleetfoot-wonderbolt-fly-left.gif,Vertical_Only,,,,False,0,0,,True,,,\"49,50\",\"42,50\",False,2,Fixed\nBehavior,uniform_dash,0.25,8,2,5,fleetfoot-wonderbolt-fly-right.gif,fleetfoot-wonderbolt-fly-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"49,50\",\"42,50\",False,2,Fixed\nBehavior,uniform_walk,0.2,10,3,3,fleetfoot-wonderbolt-trot-right.gif,fleetfoot-wonderbolt-trot-left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"43,48\",\"42,48\",False,2,Fixed\nBehavior,undress,0.08,8,4,3,fleetfoot-wonderbolt-trot-right.gif,fleetfoot-wonderbolt-trot-left.gif,Horizontal_Only,stand,,,False,0,0,,True,,,\"43,48\",\"42,48\",False,2,Fixed\nBehavior,wonderbolts,0.1,2.5,2.5,5,fleetfoot-wonderbolt-fly-right.gif,fleetfoot-wonderbolt-fly-left.gif,None,wonderbolts_1,,,True,-41,-32,Spitfire,False,uniform_stand,uniform_fly,\"49,50\",\"42,50\",False,0,Mirror\nBehavior,wonderbolts_1,0.25,5,5,18,fleetfoot-fastfly-right.gif,fleetfoot-fastfly-left.gif,Diagonal_horizontal,,,,True,-41,-32,Spitfire,False,wonderbolts_1,wonderbolts_1,\"59,54\",\"54,54\",False,2,Mirror\nEffect,hearts,bigmac-follow,heart-big.gif,heart-big.gif,1,0.5,Top,Left,Top,Right,False,False\nEffect,stormclouds_2,wonderbolts_1,smoke_trail.gif,smoke_trail.gif,1,0.03,Center,Center,Center,Center,False,False\nSpeak,\"Unnamed #1\",\"Lets go, Wonderbolts!!\",,False,0\nSpeak,\"Unnamed #2\",\"This is your chance to fly with the winners!\",,False,0\nSpeak,\"BigMac #1\",\"Oh... my...!\",,True,0\nSpeak,\"BigMac #2\",\"Spring... wedding...\",,True,0\n", "baseurl": "ponies/fleetfoot/"},
                  {"ini": "Name,\"Fleur de lis\"\nCategories,\"supporting ponies\",mares,unicorns\nBehavior,portrait,0,1.12,1.12,0,fleur_portrait_right.gif,fleur_portrait_left.gif,MouseOver,,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walking,0.25,8,6,1,fleur_walk_right_8.gif,fleur_walk_left_8.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,idle1,0.8,2,1,0,fleur_idle1_right.gif,fleur_idle1_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,idle2,0.8,3,1,0,fleur_idle2_right.gif,fleur_idle2_left.gif,Sleep,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/fleur%20de%20lis/"},
                  {"ini": "Name,Flim\nCategories,\"supporting ponies\",stallions,unicorns\nBehavior,stand,0.5,30,15,0,flim_idle_right.gif,flim_idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,trot,0.5,20,15,2,flim_trot_right.gif,flim_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"40,54\",\"39,54\",False,0,Fixed\n", "baseurl": "ponies/flim/"},
                  {"ini": "Name,Flitter\nCategories,\"supporting ponies\",mares,pegasi\nBehavior,stand,0.15,18,9,0,flitter_stand_right.gif,flitter_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"trot wing blink\",0.45,27,12,3,flitter_trotcycle_right_blinking_wing_up.gif,flitter_trotcycle_left_blinking_wing_up.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"stand wing\",0.18,18,9,0,flitter_stand_right_wing_up.gif,flitter_stand_left_wing_up.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"trot blink\",0.3,27,12,3,flitter_trotcycle_right_blinking.gif,flitter_trotcycle_left_blinking.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"trot wing\",0.15,14,8,3,flitter_trotcycle_right_wing_up.gif,flitter_trotcycle_left_wing_up.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.15,14,8,3,flitter_trotcycle_right.gif,flitter_trotcycle_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,follow,0.15,25,16,3,flitter_trotcycle_right_blinking_wing_up.gif,flitter_trotcycle_left_blinking_wing_up.gif,All,,follow,bye,False,-50,0,Cloudchaser,False,\"stand wing\",\"trot wing blink\",\"0,0\",\"0,0\",False,0\nBehavior,fly,0.3,20,15,5,flitter_fly_right.gif,flitter_fly_left.gif,All,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,hover,0.15,14,9,2,flitter_fly_right.gif,flitter_fly_left.gif,Vertical_Only,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,sit,0.1,17,12,0,flitter_sit_right.gif,flitter_sit_left.gif,None,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,sleep,0.08,45,35,0,flitter_sleep_right.gif,flitter_sleep_left.gif,Sleep,sit,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,gluts,0.1,25,16,0,flitter_stretch_right.gif,flitter_stretch_left.gif,None,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,training,0,17,17,0,flitter_stretch_right.gif,flitter_stretch_left.gif,None,,,,True,0,0,,False,,,\"0,0\",\"0,0\",False,0\nSpeak,meeting?,\"Mandatory meeting for all Ponyville Pegasi?\",{\"mandatory meeting for all ponyville pegsi.mp3\",\"mandatory meeting for all ponyville pegsi.ogg\"},False,0\nSpeak,machine?,\"Yeah! What exactly does this machine do?\",{\"yeah ... what exactly does this machine do.mp3\",\"yeah ... what exactly does this machine do.ogg\"},False,0\nSpeak,Awesome!,\"That was awesome!\",{\"that was awsome!.mp3\",\"that was awsome!.ogg\"},False,0\nSpeak,follow,\"Oh hey! Sis!\",,True,0\nSpeak,bye,\"Bye sis!\",,True,0\n", "baseurl": "ponies/flitter/"},
                  {"ini": "Name,\"Fluttershy (Filly)\"\nCategories,\"main ponies\",fillies,pegasi\nBehavior,Stand,0.1,8.24,4.12,0,fillyshy_stand_right.gif,fillyshy_stand_light.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,Trot,0.1,5.12,1.28,3,fillyshy_trot_right.gif,fillyshy_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,Sit,0.05,8.24,4.12,0,fillyshy_sitting_right.gif,fillyshy_sitting_left.gif,None,,,,False,0,0,,True,,,\"47,24\",\"24,24\",False,0,Fixed\nBehavior,Fly,0.05,5.12,1.28,3,fillyshy_fly_right.gif,fillyshy_fly_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,FlyUp,0.05,2.56,1.28,2,fillyshy_flyup_right.gif,fillyshy_flyup_left.gif,Vertical_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,Sleep,0.05,60,30,0,fillyshy_sleep_right.gif,fillyshy_sleep_left.gif,Sleep,,,,False,0,0,,True,,,\"49,20\",\"48,20\",False,0,Fixed\nSpeak,\"This place\",\"What is this place, filled with so many wonders?\",,False,0\nSpeak,\"Magical Place\",\"Oooh, what a magical place!\",,False,0\n", "baseurl": "ponies/fluttershy%20%28filly%29/"},
                  {"ini": "Name,Fluttershy\nCategories,\"main ponies\",pegasi,mares\nbehaviorgroup,1,Normal\nbehaviorgroup,2,Gala_Dress\nBehavior,stand,0.1,15,10,0,stand_fluttershy_right.gif,stand_fluttershy_left.gif,None,,,,False,0,0,,True,,,\"51,32\",\"50,32\",False,1,Fixed\nBehavior,fly_straight,0.15,10,5,2,fly_fluttershy_right.gif,fly_fluttershy_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"52,40\",\"51,40\",False,1,Fixed\nBehavior,fly,0.15,10,5,2,fly_fluttershy_updown_right.gif,fly_fluttershy_updown_left.gif,Diagonal_Vertical,,,,False,0,0,,True,,,\"52,40\",\"47,40\",False,1,Fixed\nBehavior,walk,0.25,15,5,3,trotcycle_fluttershy_right.gif,trotcycle_fluttershy_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"52,38\",\"49,38\",False,1,Fixed\nBehavior,stare,0.05,4.28,4.28,0,fluttershy_stare_right.gif,fluttershy_stare_left.gif,None,,,,False,0,0,,True,,,\"47,34\",\"64,34\",False,1,Fixed\nBehavior,sleep,0.05,60,45,0,sleeping_fluttershy_right.gif,sleeping_fluttershy_left.gif,Sleep,,,,False,0,0,,True,,,\"30,12\",\"47,12\",False,1,Fixed\nBehavior,follow_angel,0.08,60,60,3,trotcycle_fluttershy_right.gif,trotcycle_fluttershy_left.gif,All,,,,False,40,-18,Angel,True,,,\"52,38\",\"49,38\",False,1,Fixed\nBehavior,drag,0,60,60,0,fluttershy_drag_right.gif,fluttershy_drag_left.gif,Dragged,,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,mouseover,0,30,30,0,flutter_mouseover_right.gif,flutter_mouseover_left.gif,MouseOver,,,,True,0,0,,True,,,\"44,36\",\"51,36\",False,1,Fixed\nBehavior,gallop,0.15,7.2,1.44,6,flutters_gallop_right.gif,flutters_gallop_left.gif,Horizontal_Only,,,,False,0,0,,False,,,\"84,37\",\"53,37\",False,1,Fixed\nBehavior,crystallized,0.01,30,15,0,crystal-fluttershy-right.gif,crystal-fluttershy-left.gif,None,,,,False,0,0,,False,,,\"49,36\",\"50,36\",False,1,Fixed\nBehavior,photo_shoot_start,0,20,20,0,stand_fluttershy_left.gif,stand_fluttershy_left.gif,None,,,,True,0,0,,True,,,\"50,32\",\"50,32\",False,1,Fixed\nBehavior,\"theme 1\",0,18,18,3,trotcycle_fluttershy_right.gif,trotcycle_fluttershy_left.gif,Diagonal_horizontal,,,\"Theme 1\",True,0,0,,True,,,\"52,38\",\"49,38\",False,1,Fixed\nBehavior,Flottosho,0,10.24,10.24,0,stand_fluttershy_right.gif,stand_fluttershy_left.gif,None,,,,True,0,0,,True,,,\"57,33\",\"50,33\",False,1,Fixed\nBehavior,\"Conga Start\",0,5,5,10,trotcycle_fluttershy_right.gif,trotcycle_fluttershy_left.gif,Diagonal_horizontal,Conga,,,True,-80,40,\"Pinkie Pie\",False,stand,gallop,\"52,38\",\"49,38\",False,0,Fixed\nBehavior,Conga,0,30,30,1.2,congafluttershy_right.gif,congafluttershy_left.gif,Horizontal_Only,,,,True,-43,-1,\"Twilight Sparkle\",False,stand,Conga,\"52,44\",\"49,44\",False,1,Mirror\nBehavior,cuddles,0,6,6,0,cuddles.gif,cuddles.gif,None,,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,cuddle_position_left,0,5,5,3,trotcycle_fluttershy_right.gif,trotcycle_fluttershy_left.gif,All,cuddles,,,True,-60,0,\"Pinkie Pie\",False,stand,walk,\"52,38\",\"49,38\",False,1,Fixed\nBehavior,cuddle_position_right,0,5,5,3,trotcycle_fluttershy_right.gif,trotcycle_fluttershy_left.gif,All,cuddles,,,True,60,0,\"Pinkie Pie\",False,stand,walk,\"52,38\",\"49,38\",False,1,Fixed\nBehavior,cuddle_manticore_start,0,5,5,3,trotcycle_fluttershy_right.gif,trotcycle_fluttershy_left.gif,All,cuddles,,,True,40,13,Manticore,False,stand,walk,\"52,38\",\"49,38\",False,1,Mirror\nBehavior,lift_start,0,5,5,3,trotcycle_fluttershy_right.gif,trotcycle_fluttershy_left.gif,All,lift,,,True,0,-30,\"Bulk Biceps\",False,fly,fly_straight,\"52,38\",\"49,38\",False,0,Mirror\nBehavior,lift,0,10,10,0,cuddles.gif,cuddles.gif,None,,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,goto_galla,0.02,10.24,5,0,stand_fluttershy_right.gif,stand_fluttershy_left.gif,None,stand_left,,,False,0,0,,False,,,\"51,32\",\"50,32\",False,1,Fixed\nBehavior,stand_left,0.1,15,10,0,gala_fluttershy_stand_right.gif,gala_fluttershy_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"57,33\",\"50,33\",False,2,Fixed\nBehavior,stand_wings,0.1,15,10,0,gala_fluttershy_stand_right_wings.gif,gala_fluttershy_stand_left_wings.gif,None,,,,False,0,0,,True,,,\"57,33\",\"50,33\",False,2,Fixed\nBehavior,trot,0.25,15,5,3,gala_fluttershy_trot_right.gif,gala_fluttershy_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"57,39\",\"50,39\",False,2,Fixed\nBehavior,trot_wings,0.25,15,5,3,gala_fluttershy_trot_right_wings.gif,gala_fluttershy_trot_left_wings.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"57,39\",\"50,39\",False,2,Fixed\nBehavior,\"theme 1 gala\",0,18,18,3,gala_fluttershy_trot_right.gif,gala_fluttershy_trot_left.gif,Diagonal_horizontal,,,\"Theme 1\",True,0,0,,True,,,\"57,39\",\"50,39\",False,2,Fixed\nBehavior,critter,0.05,20,15,0,critter_right.png,critter_left.png,None,,,,True,0,0,,True,,,\"57,39\",\"54,39\",False,2,Fixed\nBehavior,critter_catch,0.05,3.16,3.16,0,critter_catch_right.gif,critter_catch_left.gif,None,critter,\"Soundboard #23\",,False,0,0,,True,,,\"57,45\",\"62,45\",False,2,Fixed\nBehavior,fly_gala,0.25,20,15,1,gala_fly_right.gif,gala_fly_left.gif,All,,,,False,0,0,,True,,,\"57,39\",\"50,39\",False,2,Fixed\nBehavior,\"Flottosho gala\",0,10.24,10.24,0,gala_fluttershy_stand_right.gif,gala_fluttershy_stand_left.gif,None,,,,True,0,0,,True,,,\"57,33\",\"50,33\",False,2,Fixed\nBehavior,gala_drag,0,60,60,0,gala_fluttershy_stand_right.gif,gala_fluttershy_stand_left.gif,Dragged,,,,True,0,0,,True,,,\"57,33\",\"50,33\",False,2,Fixed\nBehavior,leave_gala,0.2,15,5,0,gala_fluttershy_stand_right.gif,gala_fluttershy_stand_left.gif,None,stand,,,False,0,0,,False,,,\"57,33\",\"50,33\",False,2,Fixed\nEffect,crystalspark,crystallized,sparkle.gif,sparkle.gif,0,0,Center,Center,Center,Center,True,False\nSpeak,okay,Okay...,,False,0\nSpeak,um,Um...,,False,0\nSpeak,hi,Hi...,,False,0\nSpeak,scream,\"I'm so frustrated, I could just scream!\",{\"i am so frustrated.mp3\",\"i am so frustrated.ogg\"},False,1\nSpeak,older,\"I'm a year older than you...\",{\"im a year older than you.mp3\",\"im a year older than you.ogg\"},False,1\nSpeak,\"Soundboard #1\",\"And then, out of nowhere!\",{\"and then, out of nowhere.mp3\",\"and then, out of nowhere.ogg\"},False,1\nSpeak,\"Soundboard #2\",\"Aww, boo hoo HOO!\",{\"aww boo hoo hoo.mp3\",\"aww boo hoo hoo.ogg\"},False,1\nSpeak,\"Soundboard #3\",\"Come out!\",{\"come out.mp3\",\"come out.ogg\"},False,2\nSpeak,\"Soundboard #4\",\"*crazy laugh*\",{\"crazy laugh.mp3\",\"crazy laugh.ogg\"},False,2\nSpeak,\"Soundboard #5\",*crying*,{(crying).mp3,(crying).ogg},False,1\nSpeak,\"Soundboard #6\",*grin*,{(grin).mp3,(grin).ogg},False,0\nSpeak,\"Soundboard #7\",\"How dare you!\",{\"how dare you.mp3\",\"how dare you.ogg\"},False,1\nSpeak,\"Soundboard #9\",\"I'd like to be a tree.\",{\"id like to be a tree.mp3\",\"id like to be a tree.ogg\"},False,1\nSpeak,\"Soundboard #10\",\"I don't wanna talk about it.\",{\"i don't wanna talk about it.mp3\",\"i don't wanna talk about it.ogg\"},False,1\nSpeak,\"Soundboard #11\",\"I'll catch you yet, my pretties!\",{\"i'll catch you yeat my pretties.mp3\",\"i'll catch you yeat my pretties.ogg\"},False,2\nSpeak,\"Soundboard #13\",\"I'm Fluttershy.\",{\"i'm fluttershy.mp3\",\"i'm fluttershy.ogg\"},False,1\nSpeak,\"Soundboard #14\",\"I'm so sorry to have scared you, my friends!\",{\"i'm so sry to have scared you.mp3\",\"i'm so sry to have scared you.ogg\"},False,2\nSpeak,\"Soundboard #15\",\"I'm the world champ, you know!\",{\"i'm the world champ you know.mp3\",\"i'm the world champ you know.ogg\"},False,1\nSpeak,\"Soundboard #16\",\"Oh, I'm so frustrated I could just kick something!\",{\"kick something.mp3\",\"kick something.ogg\"},False,1\nSpeak,\"Soundboard #17\",\"Oh, my.\",{\"oh, my.mp3\",\"oh, my.ogg\"},False,0\nSpeak,\"Soundboard #18\",Oopsie.,{oopsie.mp3,oopsie.ogg},False,1\nSpeak,\"Soundboard #19\",\"Pretty please!\",{\"pretty please.mp3\",\"pretty please.ogg\"},False,0\nSpeak,\"Soundboard #20\",Waaaait!,{wait.mp3,wait.ogg},False,1\nSpeak,\"Soundboard #21\",\"Way to go!\",{\"way to go.mp3\",\"way to go.ogg\"},False,1\nSpeak,\"Soundboard #22\",Yay!,{yay.mp3,yay.ogg},False,0\nSpeak,\"Soundboard #23\",\"You're going to LOVE ME!\",{\"you're going to love me.mp3\",\"you're going to love me.ogg\"},False,2\nSpeak,\"Soundboard #24\",\"You're such a loudmouth.\",{\"you're such a loudmouth.mp3\",\"you're such a loudmouth.ogg\"},False,0\nSpeak,\"Soundboard #25\",\"You're the cutest thing ever!\",{\"you're the cutest thing ever.mp3\",\"you're the cutest thing ever.ogg\"},False,0\nSpeak,\"Soundboard #26\",\"You rock, woohoo!\",{\"you rock, woohoo.mp3\",\"you rock, woohoo.ogg\"},False,1\nSpeak,\"Theme 1\",\"\u201cSharing kindness!\u201d\",,True,0\n", "baseurl": "ponies/fluttershy/"},
                  {"ini": "Name,\"Fredrick Horseshoepin\"\nCategories,\"supporting ponies\",stallions,\"earth ponies\"\nBehavior,stand,0.3,15,10,0,fre_stand_right.gif,fre_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.15,15,10,2,fre_trot_right.gif,fre_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,cello,0.25,30,15,0,fred_piano_play.gif,fred_piano_play.gif,Sleep,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/fredrick%20horeshoepin/"},
                  {"ini": "Name,Gilda\nCategories,\"supporting ponies\",mares,non-ponies\nBehavior,stand,0.2,17,4,0,mlp_gilda_idle_right_big.gif,mlp_gilda_idle_left_big.gif,MouseOver,,,,False,0,0,,True,,,\"75,68\",\"54,68\",False,0,Fixed\nBehavior,trot,0.3,12,3,2.5,mlp_gilda_walk_right_big.gif,mlp_gilda_walk_left_big.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"75,38\",\"54,38\",False,0,Fixed\nBehavior,fly,0.2,10,2.2,3.5,mlp_gilda_flight_right_big.gif,mlp_gilda_flight_left_big.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"75,72\",\"54,72\",False,0,Fixed\nBehavior,\"junior speedsters 1\",0,1.5,1.5,0,mlp_gilda_idle_right_big.gif,mlp_gilda_idle_left_big.gif,None,\"junior speedsters 2\",,\"junior speedsters 1\",True,0,0,,True,,,\"75,68\",\"54,68\",False,0,Fixed\nBehavior,\"junior speedsters 2\",0,3.5,3.5,0,mlp_gilda_idle_right_big.gif,mlp_gilda_idle_left_big.gif,None,\"junior speedsters 3\",,\"junior speedsters 2\",True,0,0,\"Rainbow Dash\",True,,,\"75,68\",\"54,68\",False,0,Fixed\nBehavior,\"junior speedsters 3\",0,2,2,0,mlp_gilda_cheer_right.gif,mlp_gilda_cheer_right.gif,None,\"junior speedsters 4\",,\"junior speedsters 3\",True,0,0,,True,,,\"62,56\",\"62,56\",False,0,Fixed\nBehavior,\"junior speedsters 4\",0,2,2,0,mlp_gilda_cheer_left.gif,mlp_gilda_cheer_left.gif,None,\"junior speedsters 5\",,\"junior speedsters 4\",True,0,0,,True,,,\"43,56\",\"43,56\",False,0,Fixed\nBehavior,\"junior speedsters 5\",0,2,2,0,mlp_gilda_cheer_right.gif,mlp_gilda_cheer_right.gif,None,\"junior speedsters 6\",,\"junior speedsters 5\",True,0,0,,True,,,\"62,56\",\"62,56\",False,0,Fixed\nBehavior,\"junior speedsters 6\",0,2,2,0,mlp_gilda_cheer1.gif,mlp_gilda_cheer1.gif,None,\"junior speedsters 7\",,\"junior speedsters 6\",True,0,0,,True,,,\"43,56\",\"43,56\",False,0,Fixed\nBehavior,\"junior speedsters 7\",0,2,2,0,mlp_gilda_cheer1_final.gif,mlp_gilda_cheer1_final.gif,None,,,,True,0,0,,True,,,\"43,56\",\"43,56\",False,0,Fixed\nSpeak,\"Unnamed #1\",\"These lame ponies are driving me buggy.\",,False,0\nSpeak,Intro,\"That's me! Half eagle, half lion, and all awesome!\",,False,0\nSpeak,\"Junior Speedsters 1\",\"*sigh* Only for you, Dash.\",,True,0\nSpeak,\"Junior Speedsters 2\",\"Junior Speedsters are our lives...\",,True,0\nSpeak,\"Junior Speedsters 3\",\"Sky-bound soars and daring dives...\",,True,0\nSpeak,\"Junior Speedsters 4\",\"Junior Speedsters; it's our quest...\",,True,0\nSpeak,\"Junior Speedsters 5\",\"To someday be the very best...\",,True,0\nSpeak,\"Junior Speedsters 6\",(\u00ac_\u00ac),,True,0\nSpeak,\"Soundboard #1\",\"Don't you know how to take GET LOST for an answer?\",{\"get lost.mp3\",\"get lost.ogg\"},False,0\nSpeak,\"Soundboard #2\",\"I know what you're up to!\",{\"i know what you're up to.mp3\",\"i know what you're up to.ogg\"},False,0\nSpeak,\"Soundboard #3\",\"When you decide not be lame anymore, give me a call!\",{\"when you decide not be lame anymore.mp3\",\"when you decide not be lame anymore.ogg\"},False,0\nSpeak,\"Soundboard #4\",\"You're such a flip-flop! Cool one minute and lame the next.\",{\"you're such a flip-flop.mp3\",\"you're such a flip-flop.ogg\"},False,0\n", "baseurl": "ponies/gilda/"},
                  {"ini": "Name,\"Ginger Snap\"\nCategories,\"supporting ponies\",fillies,\"earth ponies\"\nBehavior,stand,0.4,15,5,0,gsnap-idle-right.gif,gsnap-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"33,38\",\"34,38\",False,0,Fixed\nBehavior,walk,0.5,15,7,2,gsnap-trot-right.gif,gsnap-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"33,44\",\"34,44\",False,0,Fixed\nSpeak,\"Speech 1\",\"May I interest you in buying some cookies?\",,False,0\n", "baseurl": "ponies/ginger%20snap/"},
                  {"ini": "Name,\"Grace Manewitz\"\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,idle,0.15,20,10,0,tapetapetiquetique_r.gif,tapetapetiquetique_r.gif,None,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,Turny,0.05,1,1,0,turnyturny2_r.gif,turnyturny2_r.gif,None,\"Your schedule sir.\",,,False,0,0,,False,,,\"0,0\",\"0,0\",True,0\nBehavior,\"Your schedule sir.\",0,3.3,3.3,0,recall4_r.gif,recall4_r.gif,None,returny,schedule,,True,0,0,,False,,,\"0,0\",\"0,0\",True,0\nBehavior,returny,0,0.9,0.9,0,returny1_r.gif,returny1_r.gif,None,idle,,interweb,True,0,0,,False,,,\"0,0\",\"0,0\",True,0\nSpeak,schedule,\"I don't recall procrastination as one of today's activities. \",,True,0\nSpeak,interweb,\"There'll be time to navigate the web when the works are done.\",,True,0\n", "baseurl": "ponies/grace%20manewitz/"},
                  {"ini": "Name,\"Granny Smith\"\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,idle,0.35,20,10,0,granny-smith-idle-right.gif,granny-smith-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"34,36\",\"0,0\",False,0,Fixed\nBehavior,trot,0.45,20,10,1,granny-smith-trot-right.gif,granny-smith-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"36,36\",\"35,36\",False,0,Fixed\nBehavior,chair,0.1,40,15,0,granny-smith-snoozing-right.gif,granny-smith-snoozing-left.gif,Sleep,,zzz,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nSpeak,zzz,...zzz...,,True,0\nSpeak,\"five hours ago\",\"I should\u2019ve been asleep five hours ago!\",{asleep.mp3,asleep.ogg},False,0\nSpeak,\"Speech 1\",\"Hah, fiddlesticks!\",,False,0\nSpeak,\"Speech 2\",\"Ah used to be an aqua-pony in mah youth.\",,False,0\nSpeak,\"Speech 3\",\"Darn tootin'!\",,False,0\nSpeak,\"Speech 4\",\"Confangled modern doohickey.\",,False,0\nSpeak,\"Speech 5\",\"Who you callin' old!?\",,False,0", "baseurl": "ponies/granny%20smith/"},
                  {"ini": "Name,Gummy\nCategories,pets\nBehavior,stand,0.1,15,10,0,stand_gummy_right.gif,stand_gummy_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,fly,0.1,10,5,3,walkcycle_gummy_right.gif,walkcycle_gummy_left.gif,Diagonal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.1,15,5,3,walkcycle_gummy_right.gif,walkcycle_gummy_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,balloon_bounce,0.15,15,7,2,bouncing_right.gif,bouncing_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,follow_pinkamena,0.5,60,60,2,walkcycle_gummy_right.gif,walkcycle_gummy_left.gif,All,,,,False,-45,56,\"Pinkamena Diane Pie\",True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,gummy_balloon_poke,0,60,60,3,bouncing_right.gif,bouncing_left.gif,Diagonal_horizontal,,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,follow_pinkie,0.5,60,60,2,walkcycle_gummy_right.gif,walkcycle_gummy_left.gif,All,,,,False,-45,56,\"Pinkie Pie\",True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,bite_left,0,11.5,11.5,0,bite.gif,bite.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,bite_right,0,11.5,11.5,0,bite.gif,bite.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,crocodance,0.03,10,5,0,dance_gummy_right.gif,dance_gummy_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,bite_position_left,0,10,10,3,walkcycle_gummy_right.gif,walkcycle_gummy_left.gif,All,bite_left,,,True,-63,25,\"Pinkie Pie\",True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,bite_position_right,0,10,10,3,walkcycle_gummy_right.gif,walkcycle_gummy_left.gif,All,bite_right,,,True,63,25,\"Pinkie Pie\",True,,,\"0,0\",\"0,0\",False,0,Fixed\nSpeak,nak,\"NAK NAK NAK NAK NAK\",,False,0\nSpeak,blink,\"*blink* *blink*\",,False,0\n", "baseurl": "ponies/gummy/"},
                  {"ini": "Name,\"Gustave le Grand\"\nCategories,\"supporting ponies\",stallions,non-ponies\nBehavior,stand,0.2,17,10,0,gustave_idle_right.gif,gustave_idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"88,82\",\"48,82\",False,0\nBehavior,trot,0.3,12,3,2.8,gustave_walk_right.gif,gustave_walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"88,82\",\"32,82\",False,0\nBehavior,fly,0.2,10,2.2,4,gustave_flight_right.gif,gustave_flight_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"86,94\",\"34,94\",False,0\nSpeak,\"Unnamed #1\",\"I, Gustave Le Grand, do challenge your crude cake to a duel of delectable delicacies!\",,False,0\n", "baseurl": "ponies/gustave/"},
                  {"ini": "Name,\"Hayseed Turnip Truck\"\nCategories,\"Supporting Ponies\",Stallions,\"Earth Ponies\"\nBehavior,idle,0.2,7,5,0,hayseed-idle-right.gif,hayseed-idle-left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,trot,0.5,15,5,3,hayseed-trot-right.gif,hayseed-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\n", "baseurl": "ponies/hayseed%20turnip%20truck/"},
                  {"ini": "Name,Hoity-Toity\nCategories,\"supporting ponies\",stallions,\"earth ponies\"\nBehavior,stand,0.5,20,15,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"45,46\",\"0,0\",False,0,Fixed\nBehavior,walk,0.5,20,15,3,walk_right.gif,walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"46,46\",\"37,46\",False,0,Fixed\nBehavior,sit,0.5,0.95,0.95,0,hoidysitrsize.gif,hoidysitlsize.gif,None,applaud,,,False,0,0,,True,,,\"63,42\",\"38,42\",True,0,Fixed\nBehavior,applaud,0.5,15,10,0,hoidyapplausersize.gif,hoidyapplauselsize.gif,None,rise,,,True,0,0,,True,,,\"63,42\",\"20,42\",False,0,Fixed\nBehavior,rise,0.5,1,1,0,hoidyuprsize.gif,hoidyuplsize.gif,None,stand,,,True,0,0,,True,,,\"63,42\",\"36,42\",True,0,Fixed\n", "baseurl": "ponies/hoity-toity/"},
                  {"ini": "Name,\"Horte Cuisine\"\nCategories,\"supporting ponies\",stallions,\"earth ponies\"\nBehavior,Stand,0.5,20,15,0,horte_cuisine_stand_right.gif,horte_cuisine_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.5,20,15,3,horte_cuisine_trot_right.gif,horte_cuisine_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/horte%20cuisine/"},
                  {"ini": "Name,\"Igneous Rock\"\nCategories,stallions,\"supporting ponies\",\"earth ponies\"\nBehavior,idle,0.5,20,15,0,\"igneous blink right.gif\",\"igneous blink left.gif\",MouseOver,,,,False,0,0,,True,,,\"41,46\",\"56,46\",False,0,Fixed\nBehavior,trot,0.5,20,15,2,\"igneus rock trotting right.gif\",\"igneus rock trotting left.gif\",Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\n", "baseurl": "ponies/igneous%20rock/"},
                  {"ini": "Name,\"Inky Pie\"\nCategories,fillies,\"earth ponies\",\"supporting ponies\"\nBehavior,idle,0.5,20,15,0,idle_right.gif,idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,trot,0.5,20,15,2,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"32,36\",\"31,36\",False,0,Fixed\nBehavior,DJ1,0.25,10,8,0,boogy_inky4_right.gif,boogy_inky4_left.gif,None,,,,True,0,0,,True,,,\"36,46\",\"35,46\",False,0,Fixed\n", "baseurl": "ponies/inky%20pie/"},
                  {"ini": "Name,\"Iron Will\"\nCategories,non-ponies,\"supporting ponies\",stallions\nBehavior,walk,0.5,20,10,2,ironwill_walk_right.gif,ironwill_walk_left.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/iron%20will/"},
                  {"ini": "Name,\"Jes\u00fas Pezu\u00f1a\"\nCategories,\"Supporting Ponies\",Stallions,\"Earth Ponies\"\nBehavior,idle,0.2,15,5,0,jesus-idle-right.gif,jesus-idle-left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.3,15,5,3,jesus-trot-right.gif,jesus-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/jes%C3%BAs%20pezu%C3%B1a/"},
                  {"ini": "Name,\"King Sombra\"\nCategories,stallions,unicorns,\"supporting ponies\"\nBehavior,stand,0.25,8,6,0,sombra-idle-right.gif,sombra-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"75,88\",\"38,88\",False,0\nBehavior,trot,0.25,6,3,2.6,sombra-trot-right.gif,sombra-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"72,86\",\"40,86\",False,0\nBehavior,crystals,0.1,4,3,2.4,sombra-trot-right.gif,sombra-trot-left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"72,86\",\"40,86\",False,0\nEffect,\"Summon crystal\",crystals,\"black crystal1.gif\",\"black crystal1.gif\",3,0.7,Bottom_Left,Bottom,Bottom_Right,Bottom,False,True\nSpeak,\"Unnamed #1\",Guahaha!,{guahaha.mp3,guahaha.ogg},False,0\nSpeak,\"Unnamed #2\",\"Haah... cryyyssstaaalsss!\",,False,0\nSpeak,\"Unnamed #3\",\"... My crystal slaaavvesss...\",,False,0\nSpeak,\"Unnamed #4\",Crystalsss...,,False,0\nSpeak,\"Unnamed #5\",\"*mumble* crystals *mumble\",,False,0\nSpeak,\"Unnamed #6\",\"Hrm... cryyssstal heeaaarrrrt...\",,False,0\nSpeak,\"Unnamed #7\",*grumble*,,False,0\n", "baseurl": "ponies/king%20sombra/"},
                  {"ini": "Name,\"Lady Justice\"\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.5,13,8,0,ladyjustice-idle-right.gif,ladyjustice-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.5,15,7,3,ladyjustice-trot-right.gif,ladyjustice-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,follow_mayor,0.1,25,15,3,ladyjustice-trot-right.gif,ladyjustice-trot-left.gif,Diagonal_horizontal,,,,False,-16,8,\"Mayor Mare\",True,,,\"0,0\",\"0,0\",False,0,Mirror\nSpeak,\"Speech #1\",\"Objection overruled!\",,False,0\nSpeak,\"Speech #2\",\"Order in court!\",,False,0\nSpeak,\"Speech #3\",\"I love my little gavel.\",,False,0\nSpeak,\"Speech #4\",\"I bring swift justice.\",,False,0\n", "baseurl": "ponies/lady%20justice/"},
                  {"ini": "Name,\"Lemon Hearts\"\nCategories,\"supporting ponies\",mares,unicorns\nBehavior,stand,0.28,19,15,0,lemon_hearts_stand_right.gif,lemon_hearts_stand_left.gif,MouseOver,,,,False,0,0,,False,,,\"43,40\",\"0,0\",False,0,Fixed\nBehavior,sweeping,0.1,9.1,9.1,0,lemon_hearts_sweeping_right.gif,lemon_hearts_sweeping_left.gif,Dragged,,,,False,0,0,,False,,,\"43,42\",\"87,42\",False,0,Fixed\nBehavior,trot,0.2,19,14,3,lemon_hearts_trot_right.gif,lemon_hearts_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"trot blink\",0.3,26,18,3,lemon_hearts_trot_right_blink.gif,lemon_hearts_trot_left_blinking.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,sit,0.16,20,15,0,lemon_hearts_sit_right.gif,lemon_hearts_sit_left.gif,None,,,,False,0,0,,False,,,\"39,20\",\"40,20\",False,0,Fixed\nBehavior,sleep,0.1,40,36,0,lemon_hearts_sleep_right.gif,lemon_hearts_sleep_left.gif,Sleep,sit,,,False,0,0,,False,,,\"39,22\",\"34,22\",False,0,Fixed\nSpeak,embarassment,\"She's an embarrassment to all things fashion!\",{\"embarrassement to all things fashion!.mp3\",\"embarrassement to all things fashion!.ogg\"},False,0\nSpeak,\"two bits\",\"I'll give you two bits for that cherry.\",{\"two bits for that cherry.mp3\",\"two bits for that cherry.ogg\"},False,0\n", "baseurl": "ponies/lemon%20hearts/"},
                  {"ini": "Name,\"Lightning Bolt\"\nCategories,\"supporting ponies\",mares,pegasi\nBehavior,stand,0.2,15,10,0,lightning_bolt_stand_right.gif,lightning_bolt_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.15,15,10,3,lightning_bolt_walk_right.gif,lightning_bolt_walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,hover,0.25,15,10,2,lightning_bolt_hover_right.gif,lightning_bolt_hover_left.gif,Vertical_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,fly,0.2,15,10,3,lightning_bolt_fly_right.gif,lightning_bolt_fly_left.gif,All,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,sleep,0.1,30,25,0,lightning_bolt_sleep_right.gif,lightning_bolt_sleep_left.gif,Sleep,,,,False,0,0,,True,,,\"35,12\",\"24,12\",False,0,Fixed\n", "baseurl": "ponies/lightning%20bolt/"},
                  {"ini": "Name,\"Lightning Dust\"\nCategories,mares,pegasi,\"supporting ponies\"\nBehavior,stand,0.3,12,10,0,lightning-dust-idle-right.gif,lightning-dust-idle-left.gif,None,,,,False,0,0,,True,,,\"43,50\",\"42,50\",False,0,Fixed\nBehavior,walk,0.4,15,7,2.8,lightning-dust-trot-right.gif,lightning-dust-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"45,56\",\"44,56\",False,0,Fixed\nBehavior,fly,0.2,12,10,4,lightning-dust-fly-right.gif,lightning-dust-fly-left.gif,All,,,,False,0,0,,True,,,\"49,58\",\"46,58\",False,0,Fixed\nSpeak,\"Speech 1\",\"Let me show you what I've got!\",,False,0\nSpeak,\"Speech 2\",\"I wanna push my limits.\",,False,0\nSpeak,\"Speech 3\",\"Hey, you snooze, you lose!\",,False,0\n", "baseurl": "ponies/lightning%20dust/"},
                  {"ini": "Name,Lily\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.25,18,10,0,lily_idle_right.gif,lily_idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"46,42\",\"0,0\",False,0,Fixed\nBehavior,trot,0.25,10,8,2.8,lily_trot_right.gif,lily_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"45,42\",\"0,0\",False,0,Fixed\nBehavior,panic,0.05,3,1,0,lily-panic-right.gif,lily-panic-left.gif,None,panic1,,speech2,False,0,0,,True,,,\"46,56\",\"69,56\",False,0,Fixed\nBehavior,panic1,0.25,18,5,6,lily-panicrun-right.gif,lily-panicrun-left.gif,Horizontal_Only,,,,True,0,0,,True,,,\"65,34\",\"52,34\",False,0,Fixed\nBehavior,\"follow Daisy\",0.1,20,15,2.7,lily_trot_right.gif,lily_trot_left.gif,Diagonal_horizontal,,daisy,,False,-16,6,Daisy,True,,,\"0,0\",\"0,0\",False,0,Mirror\nSpeak,speech,\"The horror, the horror!\",,False,0\nSpeak,speech1,\"This is awful! Horribly, terribly awful!\",,False,0\nSpeak,speech2,Eek!!,,True,0\nSpeak,daisy,\"Hey Daisy!\",,True,0\n", "baseurl": "ponies/lily/"},
                  {"ini": "Name,\"Little Strongheart\"\nCategories,\"supporting ponies\",mares,non-ponies\nBehavior,stand,0.5,7.2,2,0,little_strongheart_stand_right.gif,little_strongheart_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,trot,0.5,20,15,2,little_strongheart_trot_right.gif,little_strongheart_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"44,52\",\"39,52\",False,0,Fixed\nBehavior,nervous,0,4.4,4.4,0,little_strongheart_nervous_right.gif,little_strongheart_nervous_left.gif,None,,,,False,0,0,Braeburn,False,nervous,nervous,\"44,52\",\"39,52\",False,0,Fixed\n", "baseurl": "ponies/little%20strongheart/"},
                  {"ini": "Name,Lotus\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.1,15,10,0,stand_lotus_right.gif,stand_lotus_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,fly,0.15,10,5,3,trotcycle_lotus_right.gif,trotcycle_lotus_left.gif,Diagonal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.25,15,5,3,trotcycle_lotus_right.gif,trotcycle_lotus_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/lotus/"},
                  {"ini": "Name,Lyra\nCategories,\"supporting ponies\",mares,unicorns\nBehavior,stand,0.25,10,3,0,lyra_stand_right.gif,lyra_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"46,42\",\"0,0\",False,0,Fixed\nBehavior,happybounce,0.1,15,3,0,lyra_jump_right.gif,lyra_jump_left.gif,None,,,,False,0,0,,True,,,\"60,114\",\"43,114\",False,0,Fixed\nBehavior,walk,0.25,15,3,3,walk_right.gif,walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"53,44\",\"44,44\",False,0,Fixed\nBehavior,sit,0.25,15,3,0,lyra_sit_right.gif,lyra_sit_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,follow,0.02,60,15,3,walk_right.gif,walk_left.gif,All,,hi,,False,39,0,Bon-Bon,True,,,\"53,44\",\"44,44\",False,0,Fixed\nBehavior,sleep,0.15,15,5,0,lyra_sleep_right.gif,lyra_sleep_left.gif,Sleep,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,lyrabon,0.25,40,35,0,lyrabench-big.gif,lyrabench-big.gif,None,,sit,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,lyrashine,0.25,40,35,0,lyrabench-big.gif,lyrabench-big.gif,None,,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nSpeak,\"Unnamed #1\",\"Where's Bon-Bon?\",,False,0\nSpeak,sit,\"Hey Bon-Bon, come here!\",,True,0\nSpeak,hi,Bon-Bon~,,True,0\n", "baseurl": "ponies/lyra/"},
                  {"ini": "Name,Mane-iac\nCategories,mares,\"earth ponies\",\"supporting ponies\"\nBehavior,stand,0.5,15,10,0,mane-iac-idle-right.gif,mane-iac-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"78,98\",\"78,98\",False,0\nBehavior,walk,0.5,15,7,3,mane-iac-walk-right.gif,mane-iac-walk-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"107,108\",\"107,108\",False,0\nBehavior,relax,0.2,15,10,0,mane-iac-lying-right.gif,mane-iac-lying-left.gif,None,,,,False,0,0,,True,,,\"98,78\",\"98,78\",False,0\nBehavior,sleep,0.07,30,15,0,mane-iac-sleep-right.gif,mane-iac-sleep-left.gif,Sleep,,,,False,0,0,,True,,,\"98,78\",\"98,78\",False,0\nSpeak,\"Speech 1\",Bwahaha!,{\"mane laugh.mp3\",\"mane laugh.ogg\"},False,0\nSpeak,\"Speech 2\",\"Time for the mane event!\",{\"mane event.mp3\",\"mane event.ogg\"},False,0\nSpeak,\"Speech 3\",\"Hahaha... haha!\",{\"mane laugh2.mp3\",\"mane laugh2.ogg\"},False,0\nSpeak,\"Speech 4\",\"This has been quite the mane-raising experience.\",{\"mane raising.mp3\",\"mane raising.ogg\"},False,0\nSpeak,\"Speech 5\",\"Tonight we stand upon the brink of immortality!\",{\"mane immortality.mp3\",\"mane immortality.ogg\"},False,0\nSpeak,\"Speech 6\",\"Behold the Hairspray-Ray of Doom\u2122!\",{\"mane hairspray.mp3\",\"mane hairspray.ogg\"},False,0\n", "baseurl": "ponies/mane-iac/"},
                  {"ini": "Name,Manticore\nCategories,non-ponies\nBehavior,stand,0.25,20,8,0,manticore-idle-right.gif,manticore-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"77,57\",\"76,57\",False,0,Fixed\nBehavior,walk,0.25,20,8,2,manticore-walk-right.gif,manticore-walk-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"75,57\",\"76,57\",False,0,Fixed\nBehavior,purr,0.05,8,4,0,manticore-purr-right.gif,manticore-purr-left.gif,None,,,,False,0,0,,True,,,\"75,57\",\"76,57\",False,0,Fixed\nBehavior,smilewalk,0.25,20,8,2,manticore-smilewalk-right.gif,manticore-smilewalk-left.gif,Diagonal_horizontal,,,,True,0,0,,True,,,\"75,57\",\"76,57\",False,0,Fixed\nBehavior,cuddle_manticore_start,0,5,5,3,manticore-smilewalk-right.gif,manticore-smilewalk-left.gif,All,cuddles,,,True,40,-13,Fluttershy,True,,,\"75,57\",\"76,57\",False,0,Mirror\nBehavior,cuddles,0.25,6,6,0,manticore-lick-right.gif,manticore-lick-left.gif,None,smilewalk,purring,,True,0,-6,Fluttershy,False,cuddles,cuddles,\"89,58\",\"100,58\",False,0,Fixed\nSpeak,purring,*purr*,,True,1\n", "baseurl": "ponies/manticore/"},
                  {"ini": "Name,\"Mayor Mare\"\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.5,15,10,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.5,15,10,3,walk_right.gif,walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,Speech,\"As your Mayor, I would like to... Wait, is anypony listening?\",,False,0\n", "baseurl": "ponies/mayor%20mare/"},
                  {"ini": "Name,Mjolna\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,Standing,0.5,10,3,0,standingmjolnaright.gif,standingmjolnaleft.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,Trotting,0.5,10,3,3,trottingmjolnaright.gif,trottingmjolnaleft.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/mjolna/"},
                  {"ini": "Name,\"Mr Breezy\"\nCategories,stallions,\"earth ponies\",\"supporting ponies\"\nBehavior,stand,0.2,15,3,0,\"mister breezy blink right.gif\",\"mister breezy blink left.gif\",None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walking,0.35,15,5,2,\"mister breezy trot right.gif\",\"mister breezy trot left.gif\",Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/mr%20breezy/"},
                  {"ini": "Name,\"Mr Cake\"\nCategories,\"supporting ponies\",stallions,\"earth ponies\"\nBehavior,stand,0.25,20,5,0,mr_cake_idle_right.gif,mr_cake_idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.25,20,8,3,mr_cake_trot_right.gif,mr_cake_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/mr%20cake/"},
                  {"ini": "Name,\"Mr Greenhooves\"\nCategories,stallions,\"earth ponies\",\"supporting ponies\"\nBehavior,stand,0.2,15,3,0,\"greenhooves blink right.gif\",\"greenhooves blink left.gif\",None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walking,0.35,15,5,2,\"greenhooves walk right.gif\",\"greenhooves walk left.gif\",Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/mr%20greenhooves/"},
                  {"ini": "Name,\"Mrs Cake\"\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.25,20,8,0,mrs_cake_idle_right.gif,mrs_cake_idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.25,20,8,3,mrs_cake_trot_right.gif,mrs_cake_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/mrs%20cake/"},
                  {"ini": "Name,\"Mrs Sparkle\"\nCategories,\"supporting ponies\",mares,unicorns\nBehavior,stand,0.1,15,10,0,twilight-velvet-idle-right.gif,twilight-velvet-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,fly,0.15,10,5,2,trot_mrs_sparkle_right.gif,trot_mrs_sparkle_left.gif,Diagonal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.25,15,5,3,trot_mrs_sparkle_right.gif,trot_mrs_sparkle_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,follow_daughter,0.05,60,60,3,trot_mrs_sparkle_right.gif,trot_mrs_sparkle_left.gif,All,,follow_daughter,,False,0,-10,\"Twilight Sparkle (Filly)\",True,,,\"0,0\",\"0,0\",False,0,Fixed\nSpeak,follow_daughter,\"Oh, Twilight! Where are you?\",,True,0\nSpeak,love_daughter,\"I love my little Twilight so much! <3\",,False,0\n", "baseurl": "ponies/mrs%20sparkle/"},
                  {"ini": "Name,\"Ms Harshwhinny\"\nCategories,Mares,\"Supporting Ponies\",\"Earth Ponies\"\nBehavior,stand,0.5,20,15,0,harshwhinny-stand-right.gif,harshwhinny-stand-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.5,20,15,2,harshwhinny-trot-right.gif,harshwhinny-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,professionalism,\"Professionalism, Ms. Dash!\",,False,0\nSpeak,outbursts,\"Ms. Dash, will you please curb your over-enthusiastic outbursts?\",,False,0", "baseurl": "ponies/ms%20harshwhinny/"},
                  {"ini": "Name,\"Ms Peachbottom\"\nCategories,Mares,\"supporting ponies\",\"Earth Ponies\"\nBehavior,idle,0.5,20,15,0,ms-peachbottom-stand-right.gif,ms-peachbottom-stand-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.5,20,15,2,ms-peachbottom-trot-right.gif,ms-peachbottom-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Unnamed #1\",\"Darn-tootin, ain't that the cat's meow!'\",,False,0\nSpeak,\"Unnamed #2\",\"Hot diggety dog!\",,False,0\nSpeak,\"Unnamed #3\",\"Mind if I take a quick run outside first?\",,False,0", "baseurl": "ponies/ms%20peachbottom/"},
                  {"ini": "Name,\"Mysterious Mare Do Well\"\nCategories,mares,\"supporting ponies\",\"earth ponies\",pegasi,unicorns\nBehavior,Idle,0.15,15,10,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"28,42\",\"43,42\",False,0,Fixed\nBehavior,Trot,0.4,20,15,3,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"34,46\",\"45,46\",False,0,Fixed\nBehavior,Gallop,0.2,20,15,4,gallop_right.gif,gallop_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"49,40\",\"56,40\",False,0,Fixed\nBehavior,\"Fly 1\",0.1,20,15,4,fly_right.gif,fly_left.gif,All,,,,False,0,0,,True,,,\"37,44\",\"44,44\",False,0,Fixed\nBehavior,flyfast,0.1,20,15,6,flyfast_right.gif,flyfast_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"38,38\",\"45,38\",False,0,Fixed\nBehavior,magic,0.15,2.44,2.44,0,magic_right.gif,magic_left.gif,None,,,,False,0,0,,True,,,\"34,66\",\"47,66\",True,0,Fixed\nBehavior,teleport_start,0.05,2,2,0,teleport_right.gif,teleport_left.gif,None,teleport,,,False,0,0,,True,,,\"74,74\",\"73,74\",True,0,Fixed\nBehavior,teleport,0,3,2,20,transit.gif,transit.gif,All,teleport_end,,,True,0,0,,True,,,\"0,0\",\"0,0\",True,0,Fixed\nBehavior,teleport_end,0.05,1.5,1.5,0,teleportend_right.gif,teleportend_left.gif,None,,,,True,0,0,,True,,,\"74,74\",\"73,74\",True,0,Fixed\nSpeak,Silent,...,,False,0\n", "baseurl": "ponies/mysterious%20mare%20do%20well/"},
                  {"ini": "Name,\"Nightmare Moon\"\nCategories,\"supporting ponies\",mares,alicorns\nBehavior,stand,0.1,15,5,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.15,10,5,1,walk_right.gif,walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"tomorrow 1\",0,2,2,0,stand_right.gif,stand_left.gif,None,\"tomorrow 2\",,\"tomorrow 1\",True,0,0,\"Princess Celestia\",True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"tomorrow 2\",0,2,2,0,stand_right.gif,stand_left.gif,None,\"tomorrow 3\",,\"tomorrow 2\",True,0,0,\"Princess Celestia\",True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"tomorrow 3\",0,2,2,0,stand_right.gif,stand_left.gif,None,\"tomorrow 4\",,\"tomorrow 3\",True,0,0,\"Princess Celestia\",True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"tomorrow 4\",0,7,7,0,stand_right.gif,stand_left.gif,None,,,\"tomorrow 4\",True,0,0,\"Princess Celestia\",True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"NMM Luna\",0,5,5,0,stand_right.gif,stand_left.gif,None,\"NMM Luna 1\",,Luna,True,0,0,\"Princess Luna\",True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"NMM Luna 1\",0,4,4,0,stand_right.gif,stand_left.gif,None,,,\"Luna 1\",True,0,0,\"Princess Luna\",True,,,\"0,0\",\"0,0\",False,0\nSpeak,Luna,\"But... what about our eternal night?\",,True,0\nSpeak,\"Luna 1\",???,,True,0\nSpeak,\"Tomorrow 1\",Leave...,,True,0\nSpeak,\"Tomorrow 2\",me...,,True,0\nSpeak,\"Tomorrow 3\",ALONE!,,True,0\nSpeak,\"Tomorrow 4\",\"IT'S NOT FAIR!\",,True,0\nSpeak,\"Soundboard #1\",\"Don't you know who I am?\",{\"dont you know who i am.mp3\",\"dont you know who i am.ogg\"},False,0\nSpeak,\"Soundboard #2\",\"Oh, my beloved subjects!\",{\"oh my beloved subjects.mp3\",\"oh my beloved subjects.ogg\"},False,0\nSpeak,\"Soundboard #3\",\"The night will last FOREVER! Muhahaha\",{\"the night will last forever.mp3\",\"the night will last forever.ogg\"},False,0\nSpeak,\"Soundboard #4\",\"You little foal!\",{\"you little foal.mp3\",\"you little foal.ogg\"},False,0\nSpeak,\"Soundboard #5\",\"You're kidding. You're kidding, right?\",{\"you're kidding.mp3\",\"you're kidding.ogg\"},False,0\n", "baseurl": "ponies/nightmare%20moon/"},
                  {"ini": "Name,\"Nurse Redheart\"\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,idle,0.5,20,15,0,idle_right.gif,idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.5,20,15,3,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,100ccs,\"\u201cI need 100 cc\u2019s of friendship, stat!\u201d\",,False,0\n", "baseurl": "ponies/nurse%20redheart/"},
                  {"ini": "Name,\"Nurse Snowheart\"\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.3,15,5,0,snowheart-idle-right.gif,snowheart-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.3,15,5,3,snowheart-right.gif,snowheart-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Unnamed #1\",\"Get well soon.\",,False,0\nSpeak,\"Unnamed #2\",\"Don't worry dear, you are in good hooves.\",,False,0\n", "baseurl": "ponies/nurse%20snowheart/"},
                  {"ini": "Name,\"Nurse Sweetheart\"\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.3,15,5,0,sweetheart-idle-right.gif,sweetheart-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.3,15,5,3,sweetheart-right.gif,sweetheart-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Unnamed #1\",\"Time for your physical.\",,False,0\nSpeak,\"Unnamed #2\",\"Don't you worry, you are in good hooves.\",,False,0\n", "baseurl": "ponies/nurse%20sweetheart/"},
                  {"ini": "Name,Octavia\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.3,15,10,0,octavia_stand_right.gif,octavia_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.15,15,10,3,octavia_walk_right.gif,octavia_walk_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk_diag,0.15,10,10,2,octavia_walk_right.gif,octavia_walk_left.gif,Diagonal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,cello,0.25,30,15,0,octavia_cello.gif,octavia_cello.gif,Sleep,,,,False,0,0,,True,,,\"40,69\",\"40,69\",False,0,Fixed\nSpeak,\"Unnamed #1\",...,,False,0\nSpeak,\"Unnamed #2\",......,,False,0\nSpeak,\"Unnamed #3\",........,,False,0\nSpeak,\"Unnamed #4\",Hmph.,,False,0\nSpeak,\"Unnamed #5\",\"Practice, practice, practice.\",,False,0\n", "baseurl": "ponies/octavia/"},
                  {"ini": "Name,Opalescence\nCategories,pets\nBehavior,stand,0.15,15,10,0,opal_stand_right.gif,opal_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,fly,0.1,10,5,2,opal_walk_right.gif,opal_walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.1,15,5,2,opal_walk_right.gif,opal_walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,follow_rarity,0.4,60,60,2,opal_walk_right.gif,opal_walk_left.gif,All,,,,False,-46,-46,Rarity,True,stand,walk,\"0,0\",\"0,0\",False,0\nBehavior,Rolling,0.1,15,7,2,opal_roll_right.gif,opal_roll_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Unnamed #1\",Meow,,False,0\nSpeak,\"Unnamed #2\",\"E'roow\",,False,0\n", "baseurl": "ponies/opalescence/"},
                  {"ini": "Name,Owlowiscious\nCategories,pets,non-ponies\nBehavior,stand,0.25,20,15,0,owlowiscious-idle-right.gif,owlowiscious-idle-left.gif,None,,,,False,0,0,,True,,,\"21,28\",\"12,28\",False,0,Fixed\nBehavior,fly,0.3,30,5,3,owlowiscious-fly-right.gif,owlowiscious-fly-left.gif,All,,,,False,0,0,,True,,,\"35,42\",\"28,42\",False,0,Fixed\nBehavior,ride-start,0,3,3,2,owlowiscious-fly-right.gif,owlowiscious-fly-left.gif,All,ride,,,True,0,0,\"Twilight Sparkle\",True,,,\"35,42\",\"28,42\",False,0,Fixed\nBehavior,ride,0.15,30,30,4,blank.gif,blank.gif,All,,,,True,-10,-20,\"Twilight Sparkle\",False,ride,ride,\"1,1\",\"1,1\",False,0,Fixed\nSpeak,who1,Who.,{owl-who.mp3,owl-who.ogg},False,0\nSpeak,who2,Who?,{owl-who1.mp3,owl-who1.ogg},False,0\nSpeak,who3,Who!,{owl-who2.mp3,owl-who2.ogg},False,0\n", "baseurl": "ponies/owlowiscious/"},
                  {"ini": "Name,Parasprite\nCategories,pets,non-ponies\nbehaviorgroup,1,Start\nbehaviorgroup,2,Blue\nbehaviorgroup,3,Brown\nbehaviorgroup,4,Orange\nbehaviorgroup,5,Pink\nbehaviorgroup,6,Purple\nbehaviorgroup,7,Yellow\nbehaviorgroup,8,Red\nbehaviorgroup,9,Green\nBehavior,start_purple,0.01,0.1,0.01,0,para-purple-updown.gif,para-purple-updown.gif,None,purple-fly,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,start_blue,0.01,0.1,0.01,0,para-blue-updown.gif,para-blue-updown.gif,None,blue-fly,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,start_brown,0.01,0.1,0.01,0,para-brown-updown.gif,para-brown-updown.gif,None,brown-fly,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,start_orange,0.01,0.1,0.01,0,para-orange-updown.gif,para-orange-updown.gif,None,orange-fly,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,start_pink,0.01,0.1,0.01,0,para-pink-updown.gif,para-pink-updown.gif,None,pink-fly,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,start_yellow,0.01,0.1,0.01,0,para-yellow-updown.gif,para-yellow-updown.gif,None,yellow-fly,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,start_red,0.003,0.1,0.01,0,para-red-updown.gif,para-red-updown.gif,None,red-fly,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,start_green,0.002,0.1,0.01,0,para-green-updown.gif,para-green-updown.gif,None,green-fly,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,blue-stand,0.1,15,3,0,para-blue-updown.gif,para-blue-updown.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,2,Fixed\nBehavior,blue-fly,0.25,15,3,1.5,para-blue-right.gif,para-blue-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,2,Fixed\nBehavior,blue-updown,0.15,15,3,1,para-blue-updown.gif,para-blue-updown.gif,Vertical_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,2,Fixed\nBehavior,parasprite_follow_circle_2,0,30,25,2,para-blue-right.gif,para-blue-left.gif,All,,,,True,-12,-20,\"Pinkie Pie\",True,,,\"0,0\",\"0,0\",False,2,Mirror\nBehavior,brown-stand,0.1,15,3,0,para-brown-updown.gif,para-brown-updown.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,3,Fixed\nBehavior,brown-fly,0.25,15,3,1.5,para-brown-right.gif,para-brown-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,3,Fixed\nBehavior,brown-updown,0.15,15,3,1,para-brown-updown.gif,para-brown-updown.gif,Vertical_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,3,Fixed\nBehavior,parasprite_follow_circle_3,0,30,25,2,para-brown-right.gif,para-brown-left.gif,All,,,,True,-21,-23,\"Pinkie Pie\",True,,,\"0,0\",\"0,0\",False,3,Mirror\nBehavior,orange-stand,0.1,15,3,0,para-orange-updown.gif,para-orange-updown.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,4,Fixed\nBehavior,orange-fly,0.25,15,3,1.5,para-orange-right.gif,para-orange-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,4,Fixed\nBehavior,orange-updown,0.15,15,3,1,para-orange-updown.gif,para-orange-updown.gif,Vertical_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,4,Fixed\nBehavior,parasprite_follow_circle_4,0,30,25,2,para-orange-right.gif,para-orange-left.gif,All,,,,True,-34,-20,\"Pinkie Pie\",True,,,\"0,0\",\"0,0\",False,4,Mirror\nBehavior,pink-stand,0.1,15,3,0,para-pink-updown.gif,para-pink-updown.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,5,Fixed\nBehavior,pink-fly,0.25,15,3,1.5,para-pink-right.gif,para-pink-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,5,Fixed\nBehavior,pink-updown,0.15,15,3,1,para-pink-updown.gif,para-pink-updown.gif,Vertical_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,5,Fixed\nBehavior,parasprite_follow_circle_5,0,30,25,2,para-pink-right.gif,para-pink-left.gif,All,,,,True,-17,-16,\"Pinkie Pie\",True,,,\"0,0\",\"0,0\",False,5,Mirror\nBehavior,purple-stand,0.1,15,3,0,para-purple-updown.gif,para-purple-updown.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,6,Fixed\nBehavior,purple-fly,0.25,15,3,1.5,para-purple-right.gif,para-purple-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,6,Fixed\nBehavior,purple-updown,0.15,15,3,1,para-purple-updown.gif,para-purple-updown.gif,Vertical_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,6,Fixed\nBehavior,parasprite_follow_circle_6,0,30,25,2,para-purple-right.gif,para-purple-left.gif,All,,,,True,-26,-31,\"Pinkie Pie\",True,,,\"0,0\",\"0,0\",False,6,Mirror\nBehavior,yellow-stand,0.1,15,3,0,para-yellow-updown.gif,para-yellow-updown.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,7,Fixed\nBehavior,yellow-fly,0.25,15,3,1.5,para-yellow-right.gif,para-yellow-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,7,Fixed\nBehavior,yellow-updown,0.15,15,3,1,para-yellow-updown.gif,para-yellow-updown.gif,Vertical_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,7,Fixed\nBehavior,parasprite_follow_circle_7,0,30,25,2,para-yellow-right.gif,para-yellow-left.gif,All,,,,True,-12,-20,\"Pinkie Pie\",True,,,\"0,0\",\"0,0\",False,7,Fixed\nBehavior,red-stand,0.1,15,3,0,para-red-updown.gif,para-red-updown.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,8,Fixed\nBehavior,red-fly,0.25,15,3,1.5,para-red-right.gif,para-red-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,8,Fixed\nBehavior,red-updown,0.15,15,3,1,para-red-updown.gif,para-red-updown.gif,Vertical_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,8,Fixed\nBehavior,parasprite_follow_circle_8,0,30,25,2,para-red-right.gif,para-red-left.gif,All,,,,True,-13,-30,\"Pinkie Pie\",True,,,\"0,0\",\"0,0\",False,8,Mirror\nBehavior,green-stand,0.1,15,3,0,para-green-updown.gif,para-green-updown.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,9,Fixed\nBehavior,green-fly,0.25,15,3,1.5,para-green-right.gif,para-green-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,9,Fixed\nBehavior,green-updown,0.15,15,3,1,para-green-updown.gif,para-green-updown.gif,Vertical_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,9,Fixed\nBehavior,parasprite_follow_circle_9,0,30,25,2,para-green-right.gif,para-green-left.gif,All,,,,True,-16,-24,\"Pinkie Pie\",True,,,\"0,0\",\"0,0\",False,9,Fixed\nSpeak,\"Unnamed #1\",Chirp!,,False,0\n", "baseurl": "ponies/parasprite/"},
                  {"ini": "Name,\"Perfect Pace\"\nCategories,stallions,\"earth ponies\",\"supporting ponies\"\nBehavior,stand,0.4,15,3,0,\"perfect pace idle right.gif\",\"perfect pace idle left.gif\",None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walking,0.4,15,5,2,\"perfect pace trot right.gif\",\"perfect pace trot left.gif\",Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,doctor,0.1,15,5,2,\"perfect pace trot right.gif\",\"perfect pace trot left.gif\",Diagonal_horizontal,,\"doctor 01\",,False,0,0,\"Doctor Whooves\",True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,derpy,0.1,15,5,2,\"perfect pace trot right.gif\",\"perfect pace trot left.gif\",Diagonal_horizontal,,derpy,,False,0,0,\"Derpy Hooves\",True,,,\"0,0\",\"0,0\",False,0,Fixed\nSpeak,\"drums 1\",\"Here come the drums!\",,False,0\nSpeak,\"doctor 01\",\"We meet at last, Doctor!\",,True,0\nSpeak,\"drums 2\",\"The drum beat... the drums are coming closer... and closer.\",,False,0\nSpeak,derpy,\"Derpy Hooves! I can see you! Come on little girl, come and meet your master.\",,True,0\n", "baseurl": "ponies/perfect%20pace/"},
                  {"ini": "Name,Philomena\nCategories,pets,non-ponies\nBehavior,portait,0,18,12,0,philamina_right.gif,philamina_left.gif,None,,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,idle,0.25,8,6,0,phila_idle_right.gif,phila_idle_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,liftoff,0.25,0.51,0.51,0,phila_liftoff_right.gif,phila_liftoff_left.gif,None,tired,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,tired,0,8,4,1,phila_tired_right.gif,phila_tired_left.gif,All,landing,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,landing,0,0.3,0.3,0,phila_landing_right.gif,phila_landing_left.gif,None,idle,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,fusrohdaAAHHH,0.25,3.5,3.5,0,phila_fusrohdah_right.gif,phila_fusrohdah_left.gif,None,\"burnin'\",,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"burnin'\",0,3,3,0,phila_the_chicken_right.gif,phila_the_chicken_left.gif,None,rise,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,rise,0,3,3,0,phila_rise_right.gif,phila_rise_left.gif,None,,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,running,0.1,18,10,8,runlikeachicken1_right.gif,runlikeachicken1_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/philomena/"},
                  {"ini": "Name,\"Photo Finish\"\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.15,20,15,0,idle_right.png,idle_left.png,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.15,15,10,3,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,photo_shoot_start,0,5,5,0,itistimetomakehemagics_sinc.gif,itistimetomakehemagics_sinc.gif,None,stalk_fluttershy,magics,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,stalk_fluttershy,0,60,60,20,trot_right.gif,trot_left.gif,All,take_photos,,magics,True,-220,20,Fluttershy,True,,,\"0,0\",\"0,0\",False,0\nBehavior,take_photos,0,15,15,0,take_photos.gif,take_photos.gif,None,run,,wego,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,arrived,0.01,5,5,0,idle_right.png,idle_left.png,None,,arrived,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,point/shoot,0.01,5,5,0,idle_right.png,idle_left.png,None,,point/shoot,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,run,0.15,15,10,5,photorun_right.gif,photorun_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,magics,\"...It is time to make DE MAGICKS!!\",{\"time to make the magics.mp3\",\"time to make the magics.ogg\"},False,0\nSpeak,wego,\"I go...\",{\"i go.mp3\",\"i go.ogg\"},False,0\nSpeak,YesNo,\"Yes!  No, no, no!  Yes!!!\",,True,0\nSpeak,arrived,\"I, Photo Finish... have arrived!\",{\"i photo finish have arrived.mp3\",\"i photo finish have arrived.ogg\"},False,0\nSpeak,point/shoot,\"I only need to point and shoot, and I capture... DE MAGICKS!\",{\"i only need to point and shoot and i capture da migics.mp3\",\"i only need to point and shoot and i capture da migics.ogg\"},False,0\nSpeak,\"Soundboard #1\",Flootershay!,{fluttershy.mp3,fluttershy.ogg},False,0\nSpeak,\"Soundboard #3\",\"Oh, wunderbar!\",{\"oh, wunderbar.mp3\",\"oh, wunderbar.ogg\"},False,0\n", "baseurl": "ponies/photo%20finish/"},
                  {"ini": "Name,\"Pinkamena Diane Pie\"\nCategories,\"main ponies\",mares,\"earth ponies\",\"alternate art\"\nBehavior,stand,0.1,15,12,0,stand_pinkamena_right.gif,stand_pinkamena_left.gif,MouseOver,,,,False,0,0,,True,,,\"55,82\",\"50,82\",False,0,Fixed\nBehavior,walk,0.15,10,5,3,trotcycle_pinkamena_right.gif,trotcycle_pinkamena_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nEffect,Rocky,stand,rocky.gif,rocky.gif,0,15,Top_Right,Center,Top_Right,Center,False,False\nEffect,\"Mr Turnip\",stand,mr._turnip.gif,mr._turnip.gif,0,15,Top_Left,Center,Top_Left,Center,False,False\nEffect,\"Madam LeFlour\",stand,madame_laflour.gif,madame_laflour.gif,0,15,Bottom_Left,Center,Bottom_Left,Center,False,False\nEffect,\"Sir Lints-a-lot\",stand,sir_lints_a_lot.gif,sir_lints_a_lot.gif,0,15,Bottom_Right,Center,Bottom_Right,Center,False,False\nSpeak,\"Unnamed #1\",\"I don't need my friends... *Twitch*\",,False,0\nSpeak,\"Unnamed #2\",\"Thank you for being here today... *Twitch*\",,False,0\nSpeak,\"Soundboard #1\",\"Aha! I knew it!\",{\"aha, i knew it.mp3\",\"aha, i knew it.ogg\"},False,0\nSpeak,\"Soundboard #17\",\"My friends don't like my parties and they don't wanna be my friends anymore...\",{\"my friends don't like my parties...mp3\",\"my friends don't like my parties...ogg\"},False,0\nSpeak,\"Soundboard #13\",\"I know how it goes, all right!\",{\"i know how it goes, all right.mp3\",\"i know how it goes, all right.ogg\"},False,0\nSpeak,\"Soundboard #14\",\"I'm just glad none ah them ponies showed up!\",{\"i'm just glad none of them ponies showed up.mp3\",\"i'm just glad none of them ponies showed up.ogg\"},False,0\nSpeak,\"Soundboard #21\",\"Oui! Zhat is correct, madame.\",{\"oui, that is correct, madame.mp3\",\"oui, that is correct, madame.ogg\"},False,0\n", "baseurl": "ponies/pinkamena%20diane%20pie/"},
                  {"ini": "Name,\"Pinkie Pie (Filly)\"\nCategories,fillies,\"earth ponies\",\"main ponies\"\nBehavior,\"Stand Curly\",0.2,11,2.2,0,filly_pinkie_stand_curly_right.gif,filly_pinkie_stand_curly_left.gif,MouseOver,,,,False,0,0,,True,,,\"48,46\",\"43,46\",False,0,Fixed\nBehavior,\"Trot Curly\",0.2,8,0.8,2,filly_pinkie_trot_right.gif,filly_pinkie_trot_leftt.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"48,52\",\"43,52\",False,0,Fixed\nBehavior,Trot,0.2,8,0.8,2,filly_pinkie_trotright.gif,filly_pinkie_trotleftt.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"32,34\",\"0,0\",False,0,Fixed\nBehavior,Stand,0.2,11,2.2,0,filly_pinkie_stand_right.gif,filly_pinkie_stand_left.gif,None,,,,False,0,0,,True,,,\"32,30\",\"0,0\",False,0,Fixed\nBehavior,DJ1,0.15,10,6,0,pinkie_dancing_right.gif,pinkie_dancing_left.gif,Sleep,,,,False,0,0,,True,,,\"53,80\",\"36,80\",False,0,Fixed\n", "baseurl": "ponies/pinkie%20pie%20%28filly%29/"},
                  {"ini": "Name,\"Pinkie Pie\"\nCategories,\"main ponies\",mares,\"earth ponies\"\nbehaviorgroup,1,Normal\nbehaviorgroup,2,Gala_Dress\nBehavior,stand,0.1,10,5,0,stand_pinkiepie_right.gif,stand_pinkiepie_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,walk,0.15,10,5,3,trotcycle_pinkiepie_right.gif,trotcycle_pinkiepie_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,walk_n_n,0.15,10,5,3,trotcycle_pinkiepie_right_n_n.gif,trotcycle_pinkiepie_left_n_n.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,parade,0,5,2,3,trotcycle_parade_right.gif,trotcycle_parade_left.gif,Horizontal_Only,parasprite_stop,,,True,0,0,,True,,,\"47,55\",\"46,55\",False,1,Fixed\nBehavior,bounce,0.15,10,5,2,bounce_pinkiepie_right.gif,bounce_pinkiepie_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"58,82\",\"47,82\",False,1,Fixed\nBehavior,bounce_n_n,0.15,10,5,2,bounce_pinkiepie_right_n_n.gif,bounce_pinkiepie_left_n_n.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"58,82\",\"47,82\",False,1,Fixed\nBehavior,bounce_up,0.15,10,5,2,bounce_pinkiepie_up_down_right.gif,bounce_pinkiepie_up_down_left.gif,Vertical_Only,,,,False,0,0,,True,,,\"58,82\",\"47,82\",False,1,Fixed\nBehavior,parasprite_follow_circle1,1,5,5,3,trotcycle_parade_right.gif,trotcycle_parade_left.gif,Diagonal_horizontal,parasprite_follow_circle2,parasprite_greet,,True,0,0,,False,stand,parasprite_follow_circle1,\"47,55\",\"46,55\",False,1,Fixed\nBehavior,parasprite_follow_circle2,1,5,5,3,trotcycle_parade_right.gif,trotcycle_parade_left.gif,Diagonal_Only,parasprite_follow_circle3,,,True,0,0,,False,stand,parasprite_follow_circle1,\"47,55\",\"46,55\",False,1,Fixed\nBehavior,parasprite_follow_circle3,1,5,5,3,trotcycle_parade_right.gif,trotcycle_parade_left.gif,Diagonal_horizontal,parasprite_follow_circle4,,,True,0,0,,False,stand,parasprite_follow_circle1,\"47,55\",\"46,55\",False,1,Fixed\nBehavior,parasprite_follow_circle4,1,5,5,3,trotcycle_parade_right.gif,trotcycle_parade_left.gif,Diagonal_Only,parasprite_follow_circle5,,,True,0,0,,False,stand,parasprite_follow_circle1,\"47,55\",\"46,55\",False,1,Fixed\nBehavior,parasprite_follow_circle5,0,6,5,3,trotcycle_parade_right.gif,trotcycle_parade_left.gif,Diagonal_horizontal,parasprite_stop,,,True,0,0,,False,stand,parasprite_follow_circle1,\"47,55\",\"46,55\",False,1,Fixed\nBehavior,\"theme 1\",0,13.6,13.6,2,bounce_pinkiepie_right.gif,bounce_pinkiepie_left.gif,Diagonal_horizontal,,,\"theme 1\",True,0,0,,True,,,\"58,82\",\"47,82\",False,1,Fixed\nBehavior,pinkie_balloon_poke,0,60,60,2,fly_right.gif,fly_left.gif,Diagonal_horizontal,,,,True,0,0,,True,,,\"48,81\",\"47,81\",False,1,Fixed\nBehavior,Stalking_start,0.05,2.15,2.15,0,choppa_start_right.gif,choppa_start_left.gif,None,Stalking_Dash,,,False,0,0,\"Rainbow Dash\",False,Stalking_start,Stalking_start,\"104,178\",\"75,178\",False,1,Fixed\nBehavior,Stalking_Dash,0,60,60,3,pinkacopter_right.gif,pinkacopter_left.gif,Horizontal_Only,Stalking_stop,dash_follow,,True,50,50,\"Rainbow Dash\",False,Stalking_Dash,Stalking_Dash,\"104,178\",\"75,178\",False,1,Fixed\nBehavior,Stalking_stop,0,2.15,2.15,0,choppa_stop_right.gif,choppa_stop_left.gif,None,,,,True,0,0,,True,,,\"104,178\",\"75,178\",False,1,Fixed\nBehavior,wink,0.1,1.08,1.08,0,wink_pinkie_pie_right.gif,wink_pinkie_pie_left.gif,None,,,,False,0,0,,True,,,\"48,42\",\"0,0\",False,1,Fixed\nBehavior,drag,0,2.4,0,0,drag_pinkiepie_right.gif,drag_pinkiepie_left.gif,Dragged,,,,False,0,0,,True,,,\"48,49\",\"47,49\",False,1,Fixed\nBehavior,mouseover,0.01,5.2,2,0,mouse_pinkiepie_right.gif,mouse_pinkiepie_left.gif,MouseOver,,,,False,0,0,,True,,,\"48,48\",\"37,48\",False,1,Fixed\nBehavior,hatersgonnahate,0,15,1.28,2,haters_pinkiepie_right.gif,haters_pinkiepie_left.gif,Diagonal_horizontal,haters_stop,,,True,0,0,,True,,,\"46,44\",\"51,44\",False,1,Fixed\nBehavior,haterstart,0.07,2.4,2.4,0,hatersstart_pinkiepie_right.gif,hatersstart_pinkiepie_left.gif,None,hatersgonnahate,,,False,0,0,,True,,,\"48,44\",\"93,44\",False,1,Fixed\nBehavior,giggle,0.1,2.16,2.16,0,giggle_pinkie_pie_right.gif,giggle_pinkie_pie_left.gif,None,,,,False,0,0,,True,,,\"48,42\",\"0,0\",False,1,Fixed\nBehavior,jumpturn,0.06,7.54,1.08,3,bounceturn_pinkiepie_right.gif,bounceturn_pinkiepie_left.gif,Vertical_Only,,,,False,0,0,,True,,,\"58,82\",\"47,82\",False,1,Fixed\nBehavior,jumpturnpl,0.06,7.54,1.08,0,bounceturn_pinkiepie_right.gif,bounceturn_pinkiepie_left.gif,None,,,,False,0,0,,True,,,\"58,82\",\"47,82\",False,1,Fixed\nBehavior,flower1,0.05,3.1,3.1,0,flower1_pinkiepie_right.gif,flower1_pinkiepie_left.gif,None,,,,False,0,0,,True,,,\"48,42\",\"97,42\",False,1,Fixed\nBehavior,walk2,0.08,10,0.77,0.8,walk_pinkie_pie_right.gif,walk_pinkie_pie_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"50,44\",\"45,44\",False,1,Fixed\nBehavior,jumpy,0.07,5,0.56,0,jumpy_pinkiepie_right.gif,jumpy_pinkiepie_left.gif,None,,,,False,0,0,,True,,,\"57,78\",\"48,78\",False,1,Fixed\nBehavior,rollfinish,0,5,1,0,rollfinish_pinkiepie_right.gif,rollfinish_pinkiepie_left.gif,None,rolltransition,,,True,0,0,,True,,,\"22,7\",\"49,7\",False,1,Fixed\nBehavior,rollend,0,0.7,0.7,2,rollend_pinkiepie_right.gif,rollend_pinkiepie_left.gif,Horizontal_Only,rollfinish,,,True,0,0,,True,,,\"43,27\",\"46,27\",False,1,Fixed\nBehavior,rollsequence,0,0.6,0.6,2,rollsequence_pinkiepie_right.gif,rollsequence_pinkiepie_left.gif,Horizontal_Only,rollend,,,True,0,0,,True,,,\"43,26\",\"38,26\",False,1,Fixed\nBehavior,rollstart,0,0.8,0.8,2,rollstart_pinkiepie_right.gif,rollstart_pinkiepie_left.gif,Horizontal_Only,rollsequence,,,False,0,0,,True,,,\"41,44\",\"40,44\",False,1,Fixed\nBehavior,rolljump,0.07,0.78,0.78,0,rolljump_pinkiepie_right.gif,rolljump_pinkiepie_left.gif,None,rollstart,,,False,0,0,,True,,,\"58,82\",\"47,82\",False,1,Fixed\nBehavior,rollfinish2,0,5,1,0,rollfinish_pinkiepie_right.gif,rollfinish_pinkiepie_left.gif,None,rolltransition,,,True,0,0,,True,,,\"22,7\",\"49,7\",False,1,Fixed\nBehavior,rollend2,0,0.7,0.7,2,rollend_pinkiepie_right.gif,rollend_pinkiepie_left.gif,Horizontal_Only,rollfinish2,,,True,0,0,,True,,,\"43,27\",\"46,27\",False,1,Fixed\nBehavior,rollsequence2,0,0.6,0.6,2,rollsequence_pinkiepie_right.gif,rollsequence_pinkiepie_left.gif,Horizontal_Only,rollend2,,,True,0,0,,True,,,\"43,27\",\"38,27\",False,1,Fixed\nBehavior,rollstart2,0,0.8,0.8,2,rollstart_pinkiepie_right.gif,rollstart_pinkiepie_left.gif,Horizontal_Only,rollsequence2,,,False,0,0,,True,,,\"41,44\",\"40,44\",False,1,Fixed\nBehavior,rolljump2,0.07,0.78,0.78,0,rolljump_pinkiepie_right.gif,rolljump_pinkiepie_left.gif,None,rollstart2,,,False,0,0,,True,,,\"58,82\",\"47,82\",False,1,Fixed\nBehavior,rolltransition,0,1.28,1.28,0,rolltransition_pinkiepie_right.gif,rolltransition_pinkiepie_left.gif,None,,,,True,0,0,,True,,,\"61,80\",\"44,80\",False,1,Fixed\nBehavior,hick1,0,7,1.7,0,rofl_hickup_pinkie_pie_right.gif,rofl_hickup_pinkie_pie_left.gif,None,hickup_stop,,,True,0,0,,True,,,\"41,66\",\"46,66\",False,1,Fixed\nBehavior,hick2mix,0,15,3.6,0,rofl_hickup2mix_pinkie_pie_right.gif,rofl_hickup2mix_pinkie_pie_left.gif,None,hickup_stop,,,True,0,0,,True,,,\"49,66\",\"48,66\",False,1,Fixed\nBehavior,rofl,0,5,0.7,0,rofl2_pinkie_pie_right.gif,rofl2_pinkie_pie_left.gif,None,hickup_stop,,,True,0,0,,True,,,\"49,52\",\"48,52\",False,1,Fixed\nBehavior,hick3,0,5,1.9,0,rofl_hickup3_pinkie_pie_right.gif,rofl_hickup3_pinkie_pie_left.gif,None,hickup_stop,,,True,0,0,,True,,,\"49,60\",\"48,60\",False,1,Fixed\nBehavior,jumpflower,0.03,4.86,0.54,1.5,bounce_pinkiepie_right.gif,bounce_pinkiepie_left.gif,Diagonal_horizontal,jumppreflowe,,,False,0,0,,True,,,\"58,82\",\"47,82\",False,1,Fixed\nBehavior,jumppreflowe,0,0.54,0.54,1.5,bounce_pinkiepie_right.gif,bounce_pinkiepie_left.gif,Horizontal_Vertical,flower2,,,False,0,0,,True,,,\"58,82\",\"47,82\",False,1,Fixed\nBehavior,flower2,0,2.7,2.7,0,flower2_pinkiepie_right.gif,flower2_pinkiepie_left.gif,None,bounce_n_n,,,True,0,0,,True,,,\"68,47\",\"63,47\",False,1,Fixed\nBehavior,flower3,0.03,2.8,2.8,0,flower3_pinkiepie_right.gif,flower3_pinkiepie_left.gif,None,,,,False,0,0,,True,,,\"66,46\",\"63,46\",False,1,Fixed\nBehavior,tongue,0.05,4,0.3,0,tongue_pinkie_pie_right.gif,tongue_pinkie_pie_left.gif,None,,,,False,0,0,,True,,,\"58,36\",\"49,36\",False,1,Fixed\nBehavior,flower6,0.03,2.55,2.55,0,flower6_pinkiepie_right.gif,flower6_pinkiepie_left.gif,None,,,,False,0,0,,True,,,\"66,50\",\"63,50\",False,1,Fixed\nBehavior,flower5,0.02,4.15,4.15,0,flower5mix_pinkiepie_right.gif,flower5mix_pinkiepie_left.gif,None,,,,False,0,0,,True,,,\"66,50\",\"63,50\",False,1,Fixed\nBehavior,flower4mix,0,4.25,4.25,0,flower4mix_pinkiepie_right.gif,flower4mix_pinkiepie_left.gif,None,bounce,,,True,0,0,,True,,,\"68,47\",\"63,47\",False,1,Fixed\nBehavior,flower7,0,2.65,2.65,0,flower7_pinkiepie_right.gif,flower7_pinkiepie_left.gif,None,bounce,,,True,0,0,,True,,,\"68,47\",\"63,47\",False,1,Fixed\nBehavior,jumpflower2,0.03,4.86,0.54,1.5,bounce_pinkiepie_right.gif,bounce_pinkiepie_left.gif,Diagonal_horizontal,jumppreflowe2,,,False,0,0,,True,,,\"58,82\",\"47,82\",False,1,Fixed\nBehavior,jumppreflowe2,0,0.54,0.54,1.5,bounce_pinkiepie_right.gif,bounce_pinkiepie_left.gif,Horizontal_Vertical,flower7,,,True,0,0,,True,,,\"58,82\",\"47,82\",False,1,Fixed\nBehavior,jumpflower3,0.03,4.86,0.54,1.5,bounce_pinkiepie_right.gif,bounce_pinkiepie_left.gif,Diagonal_horizontal,jumppreflowe3,,,False,0,0,,True,,,\"58,82\",\"47,82\",False,1,Fixed\nBehavior,jumppreflowe3,0,0.54,0.54,1.5,bounce_pinkiepie_right.gif,bounce_pinkiepie_left.gif,Horizontal_Vertical,flower4mix,,,True,0,0,,True,,,\"58,82\",\"47,82\",False,1,Fixed\nBehavior,cupcake,0.1,5,5,0,cupcake_pinkie_pie_right.gif,cupcake_pinkie_pie_left.gif,None,,,,False,0,0,,True,,,\"96,64\",\"81,64\",False,1,Fixed\nBehavior,chicken,0.12,10,2.4,0,chicken_pinkie_pie_right.gif,chicken_pinkie_pie_left.gif,None,,,,False,0,0,,True,,,\"45,56\",\"64,56\",False,1,Fixed\nBehavior,sleep,0.01,30,30,0,sleep2_pinkie_pie_right.gif,sleep2_pinkie_pie_left.gif,Sleep,,,,False,0,0,,True,,,\"92,44\",\"47,44\",False,1,Fixed\nBehavior,rest,0.04,3,3,0,sleep1_pinkie_pie_right.gif,sleep1_pinkie_pie_left.gif,None,,,,False,0,0,,True,,,\"92,44\",\"47,44\",False,1,Fixed\nBehavior,Pinkacopter,0,5,1,4,pinkacopter_right.gif,pinkacopter_left.gif,All,Pinkacopter2,,,True,0,0,,True,,,\"104,178\",\"75,178\",False,1,Fixed\nBehavior,Pinkacopter2,0,5,1,4,pinkacopter_right.gif,pinkacopter_left.gif,All,Pinkacopter3,,,True,0,0,,True,,,\"104,178\",\"75,178\",False,1,Fixed\nBehavior,Pinkacopter3,0,5,1,4,pinkacopter_right.gif,pinkacopter_left.gif,All,Pinkacopter4,,,True,0,0,,True,,,\"104,178\",\"75,178\",False,1,Fixed\nBehavior,Pinkacopter4,0,5,1,4,pinkacopter_right.gif,pinkacopter_left.gif,All,Pinkacopter5,,,True,0,0,,True,,,\"104,178\",\"75,178\",False,1,Fixed\nBehavior,Pinkacopter5,0,5,1,4,pinkacopter_right.gif,pinkacopter_left.gif,All,Pinkacopter_stop,,,True,0,0,,True,,,\"104,178\",\"75,178\",False,0,Fixed\nBehavior,Pinkacopter_start,0.02,1.95,1.95,0,jumpy_pinkiepie_right.gif,jumpy_pinkiepie_left.gif,None,Pinkacopter,,,False,0,0,,True,,,\"57,78\",\"48,78\",False,1,Fixed\nBehavior,Pinkacopter_begin,0.02,2.15,2.15,0,choppa_start_right.gif,choppa_start_left.gif,None,Pinkacopter,,,False,0,0,,True,,,\"104,178\",\"75,178\",False,1,Fixed\nBehavior,Pinkacopter_stop,0,2.15,2.15,0,choppa_stop_right.gif,choppa_stop_left.gif,None,,,,True,0,0,,True,,,\"104,178\",\"75,178\",False,1,Fixed\nBehavior,backtrack,0.07,10,4,3,backtrack_pinkie_pie_right.gif,backtrack_pinkie_pie_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"45,41\",\"48,41\",False,1,Fixed\nBehavior,parasprite_stop,0,0.7,0.7,0,paraspritestop_pinkie_pie_right.gif,paraspritestop_pinkie_pie_left.gif,None,,,,True,0,0,,True,,,\"48,48\",\"47,48\",False,1,Fixed\nBehavior,parade_start,0.05,0.7,0.7,0,paraspritestart_pinkie_pie_right.gif,paraspritestart_pinkie_pie_left.gif,None,parade,,,False,0,0,,True,,,\"48,48\",\"47,48\",False,1,Fixed\nBehavior,parasprite_follow_circle,0,0.7,0.7,0,paraspritestart_pinkie_pie_right.gif,paraspritestart_pinkie_pie_left.gif,None,parasprite_follow_circle1,,,True,0,0,,True,,,\"48,48\",\"47,48\",False,1,Fixed\nBehavior,Dance_tongue,0.1,4.5,4.5,0,tonguedance_pinkie_pie_right.gif,tonguedance_pinkie_pie_left.gif,None,,,,False,0,0,,True,,,\"66,66\",\"55,66\",False,1,Fixed\nBehavior,haters_stop,0,0.76,0.76,0,hatersstop_pinkie_pie_right.gif,hatersstop_pinkie_pie_left.gif,None,,,,True,0,0,,True,,,\"50,70\",\"47,70\",True,1,Fixed\nBehavior,princess,0.05,15,8,1,princess_pinkie_right.gif,princess_pinkie_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"50,56\",\"39,56\",False,1,Fixed\nBehavior,cartwheel,0.05,10,3,2,cartwheel_pinkiepie_right.gif,cartwheel_pinkiepie_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"53,60\",\"52,60\",False,1,Fixed\nBehavior,sittinggiggle,0.05,2.3,2.3,0,sittinggiggle_pinkie_pie_right.gif,sittinggiggle_pinkie_pie_left.gif,None,,,,False,0,0,,True,,,\"48,46\",\"49,46\",False,1,Fixed\nBehavior,sneeze_stop,0,1.1,1.1,0,sneezestop_pinkie_pie_right.gif,sneezestop_pinkie_pie_left.gif,None,,,,True,0,0,,True,,,\"48,44\",\"49,44\",False,1,Fixed\nBehavior,sneeze_fly,0,5,3,21,sneezefly_pinkie_pie_right.gif,sneezefly_pinkie_pie_left.gif,Horizontal_Only,sneeze_stop,,,True,0,0,,True,,,\"53,70\",\"52,70\",False,1,Fixed\nBehavior,sneeze_start,0.02,3.3,3.3,0,sneezestart_pinkie_pie_right.gif,sneezestart_pinkie_pie_left.gif,None,sneeze_fly,,,False,0,0,,True,,,\"46,66\",\"49,66\",False,1,Fixed\nBehavior,sneeze_cute,0.02,4.6,4.6,0,sneezecute_pinkie_pie_right.gif,sneezecute_pinkie_pie_left.gif,None,,,,False,0,0,,True,,,\"48,66\",\"49,66\",False,1,Fixed\nBehavior,parasoloff,0,3,3,0,parasoloff_pinkie_pie_right.gif,parasoloff_pinkie_pie_left.gif,None,,,,True,0,0,,True,,,\"56,78\",\"49,78\",False,1,Fixed\nBehavior,twitchyrun,0,10,5,6,run_twitchy_pinkie_pie_right.gif,run_twitchy_pinkie_pie_left.gif,Horizontal_Only,parasoloff,,,True,0,0,,True,,,\"48,42\",\"57,42\",False,1,Fixed\nBehavior,parasolon,0,4,4,0,parasolon_pinkie_pie_right.gif,parasolon_pinkie_pie_left.gif,None,twitchyrun,,,True,0,0,,True,,,\"48,82\",\"57,82\",False,1,Fixed\nBehavior,twitchytail,0.005,4,2,0,twitchytail_pinkie_pie_right.gif,twitchytail_pinkie_pie_left.gif,None,parasolon,,,False,0,0,,True,,,\"67,44\",\"42,44\",False,1,Fixed\nBehavior,parasolon2,0,4,4,0,parasolon_pinkie_pie_right.gif,parasolon_pinkie_pie_left.gif,None,twitchyrun,,,True,0,0,,True,,,\"48,82\",\"57,82\",False,1,Fixed\nBehavior,twitchytail2,0.03,4,2,0,twitchytail_pinkie_pie_right.gif,twitchytail_pinkie_pie_left.gif,None,parasolon2,,,False,0,0,,True,,,\"67,44\",\"42,44\",False,1,Fixed\nBehavior,Bite_left,0,11.5,11.5,0,bite_pinkie_gummy_left.gif,bite_pinkie_gummy_left.gif,None,,,,False,0,0,,True,,,\"100,106\",\"100,106\",False,1,Fixed\nBehavior,Bite_right,0,11.5,11.5,0,bite_pinkie_gummy_right.gif,bite_pinkie_gummy_right.gif,None,,,,False,0,0,,True,,,\"57,106\",\"57,106\",False,1,Fixed\nBehavior,bite_position_left,0,10,10,3,trotcycle_pinkiepie_right.gif,trotcycle_pinkiepie_left.gif,None,Bite_left,,,False,63,-25,Gummy,True,,,\"44,46\",\"49,46\",False,1,Fixed\nBehavior,bite_position_right,0,10,10,3,trotcycle_pinkiepie_right.gif,trotcycle_pinkiepie_left.gif,None,Bite_right,,,False,-63,-25,Gummy,True,,,\"44,46\",\"49,46\",False,1,Fixed\nBehavior,pose,0.01,7.3,7.3,0,pose_pinkie_pie_right.gif,pose_pinkie_pie_left.gif,None,,,,False,0,0,,True,,,\"47,48\",\"72,48\",False,1,Fixed\nBehavior,hickup_start_1,0.02,1.58,1.58,0,hickup_start_pinkie_pie_right.gif,hickup_start_pinkie_pie_left.gif,None,hick1,,,False,0,0,,True,,,\"80,50\",\"45,50\",False,1,Fixed\nBehavior,hickup_start_1-2,0.02,0.4,0.4,0,hickup2_start_pinkie_pie_right.gif,hickup2_start_pinkie_pie_left.gif,None,hick1,,,False,0,0,,True,,,\"80,46\",\"45,46\",False,1,Fixed\nBehavior,hickup_start_2,0.02,1.58,1.58,0,hickup_start_pinkie_pie_right.gif,hickup_start_pinkie_pie_left.gif,None,hick2mix,,,False,0,0,,True,,,\"80,50\",\"45,50\",False,1,Fixed\nBehavior,hickup_start_2-2,0.02,0.4,0.4,0,hickup2_start_pinkie_pie_right.gif,hickup2_start_pinkie_pie_left.gif,None,hick2mix,,,False,0,0,,True,,,\"80,46\",\"45,46\",False,1,Fixed\nBehavior,hickup_start_3,0.02,1.58,1.58,0,hickup_start_pinkie_pie_right.gif,hickup_start_pinkie_pie_left.gif,None,rofl,,,False,0,0,,True,,,\"80,50\",\"45,50\",False,1,Fixed\nBehavior,hickup_start_3-2,0.02,0.4,0.4,0,hickup2_start_pinkie_pie_right.gif,hickup2_start_pinkie_pie_left.gif,None,rofl,,,False,0,0,,True,,,\"80,46\",\"45,46\",False,1,Fixed\nBehavior,hickup_start_4,0.02,1.58,1.58,0,hickup_start_pinkie_pie_right.gif,hickup_start_pinkie_pie_left.gif,None,hick3,,,False,0,0,,True,,,\"80,50\",\"45,50\",False,1,Fixed\nBehavior,hickup_start_4-2,0.02,0.4,0.4,0,hickup2_start_pinkie_pie_right.gif,hickup2_start_pinkie_pie_left.gif,None,hick3,,,False,0,0,,True,,,\"80,46\",\"45,46\",False,1,Fixed\nBehavior,hickup_stop,0,0.4,0.4,0,hickup_stop_pinkie_pie_right.gif,hickup_stop_pinkie_pie_left.gif,None,,,,True,0,0,,True,,,\"80,46\",\"47,46\",False,1,Fixed\nBehavior,sitrofl,0.03,1.88,1.88,0,roflsit_pinkie_pie_right.gif,roflsit_pinkie_pie_left.gif,None,,,,False,0,0,,True,,,\"78,50\",\"47,50\",False,1,Fixed\nBehavior,rofls2stop,0,0.9,0.9,0,rofls2stop_pinkie_pie_right.gif,rofls2stop_pinkie_pie_left.gif,None,,,,True,0,0,,True,,,\"90,48\",\"47,48\",False,1,Fixed\nBehavior,rofls2,0,5,3,0,rofls2_pinkie_pie_right.gif,rofls2_pinkie_pie_left.gif,None,rofls2stop,,,True,0,0,,True,,,\"86,19\",\"29,23\",False,1,Fixed\nBehavior,rofls2start,0.04,1.72,1.72,0,rofls2start_pinkie_pie_right.gif,rofls2start_pinkie_pie_left.gif,None,rofls2,,,False,0,0,,True,,,\"90,49\",\"45,49\",False,1,Fixed\nBehavior,crocodance,0.03,10,5,0,goovy_pinkie_pie_right.gif,goovy_pinkie_pie_left.gif,None,,,,False,0,0,,True,,,\"46,46\",\"41,46\",False,1,Fixed\nBehavior,teleportreappear,0,3.6,3.6,0,teleporreapear_pinkie_pie_right.gif,teleporreapear_pinkie_pie_left.gif,None,,,,True,0,0,,True,,,\"74,80\",\"53,80\",False,1,Fixed\nBehavior,\"teleport run\",0,2,2,20,teleportmove_pinkie_pie.gif,teleportmove_pinkie_pie.gif,All,teleportreappear,,,True,75,10,\"Twilight Sparkle\",False,\"teleport run\",\"teleport run\",\"0,0\",\"0,0\",False,1,Mirror\nBehavior,pinkaport,0,1.1,1.1,0,teleportstart_pinkie_pie_right.gif,teleportstart_pinkie_pie_left.gif,None,\"teleport run\",,,False,0,0,,True,,,\"74,80\",\"53,80\",False,1,Fixed\nBehavior,cannonshoot,0,1.82,1.82,0,cannonshoot_pinkie_pie_right.gif,cannonshoot_pinkie_pie_left.gif,None,,,,True,0,0,,True,,,\"78,66\",\"85,66\",False,1,Fixed\nBehavior,cannonrun,0,5,2,6,partycannon_pinkie_pie_right.gif,partycannon_pinkie_pie_left.gif,Horizontal_Only,cannonshoot,,,True,0,0,,True,,,\"50,40\",\"75,40\",False,1,Fixed\nBehavior,cannostart,0.04,2.2,2.2,0,cannonstart_pinkie_pie_right.gif,cannonstart_pinkie_pie_left.gif,None,cannonrun,,,False,0,0,,True,,,\"60,56\",\"77,56\",False,1,Fixed\nBehavior,cannonfull,0.02,3.92,3.92,0,cannonfull_pinkie_pie_right.gif,cannonfull_pinkie_pie_left.gif,None,,,,False,0,0,,True,,,\"86,67\",\"77,67\",False,1,Fixed\nBehavior,\"Ponko Poe\",0,10.24,10.24,0,stand_pinkiepie_right.gif,stand_pinkiepie_left.gif,None,,,,True,0,0,,True,,,\"48,42\",\"0,0\",False,1,Fixed\nBehavior,oink-end,0,0.4,0.4,0,oinkend_pinkie_pie_right.gif,oinkend_pinkie_pie_left.gif,None,,,,True,0,0,,True,,,\"56,74\",\"47,74\",False,1,Fixed\nBehavior,oinkbutt,0,0.84,0.84,4,oink_pinkie_pie_right.gif,oink_pinkie_pie_left.gif,Horizontal_Only,oink-end,,,True,0,0,,True,,,\"57,74\",\"36,74\",False,1,Fixed\nBehavior,oinktail,0,1.48,1.48,4,oinkoinkoinktail_pinkie_pie_right.gif,oinkoinkoinktail_pinkie_pie_left.gif,Horizontal_Only,oinkbutt,,,True,0,0,,True,,,\"44,63\",\"39,63\",False,1,Fixed\nBehavior,oinkstart,0.05,0.4,0.4,4,oinkstart_pinkie_pie_right.gif,oinkstart_pinkie_pie_left.gif,Horizontal_Only,oinktail,,,True,0,0,,True,,,\"56,74\",\"47,74\",False,1,Fixed\nBehavior,salto_end,0,1,1,0,saltoend_pinkie_pie_right.gif,saltoend_pinkie_pie_left.gif,None,,,,True,0,0,,True,,,\"71,44\",\"68,44\",False,1,Fixed\nBehavior,salto,0,0.96,0.96,4,salto_pinkie_pie_right.gif,salto_pinkie_pie_left.gif,Horizontal_Only,salto_end,,,True,0,0,,True,,,\"84,124\",\"59,124\",False,1,Fixed\nBehavior,salto_start,0.05,0.5,0.5,0,saltostart_pinkie_pie_right.gif,saltostart_pinkie_pie_left.gif,None,salto,,,False,0,0,,True,,,\"69,40\",\"46,40\",False,1,Fixed\nBehavior,salto2,0,2.88,2.88,4,salto_pinkie_pie_right.gif,salto_pinkie_pie_left.gif,Horizontal_Only,salto_end,,,True,0,0,,True,,,\"84,124\",\"59,124\",False,1,Fixed\nBehavior,salto_start2,0.05,0.5,0.5,0,saltostart_pinkie_pie_right.gif,saltostart_pinkie_pie_left.gif,None,salto2,,,False,0,0,,True,,,\"69,40\",\"46,40\",False,1,Fixed\nBehavior,flip_end,0,2.4,2.4,0,front_flip_full_twist_end_pinkie_pie_right.gif,front_flip_full_twist_end_pinkie_pie_left.gif,None,,,,True,0,0,,True,,,\"74,42\",\"49,42\",False,1,Fixed\nBehavior,flip,0,0.86,0.86,3,front_flip_full_twist_salto_pinkie_pie_right.gif,front_flip_full_twist_salto_pinkie_pie_left.gif,Horizontal_Only,flip_end,,,True,0,0,,True,,,\"43,103\",\"66,103\",False,1,Fixed\nBehavior,flip_start,0.04,0.64,0.64,0,front_flip_full_twist_start_pinkie_pie_right.gif,front_flip_full_twist_start_pinkie_pie_left.gif,None,flip,,,False,0,0,,True,,,\"48,40\",\"55,40\",False,1,Fixed\nBehavior,oinkprestart,0.05,0.01,0.01,0,stand_pinkiepie_right.gif,stand_pinkiepie_left.gif,None,oinkstart,,,False,0,0,,True,,,\"48,42\",\"0,0\",False,1,Fixed\nBehavior,sit,0.03,4.72,4.72,0,sit_pinkie_pie_right.gif,sit_pinkie_pie_left.gif,None,,,,False,0,0,,True,,,\"60,42\",\"49,42\",False,1,Fixed\nBehavior,\"epic rearing\",0.03,2,2,0,epic_pinkie_pie_right.gif,epic_pinkie_pie_left.gif,None,,,,False,0,0,,True,,,\"54,42\",\"51,42\",False,1,Fixed\nBehavior,\"epic rearing2\",0.03,2,2,0,epic_pinkie_pie_right.gif,epic_pinkie_pie_left.gif,None,galopp,,,False,0,0,,True,,,\"54,42\",\"51,42\",False,1,Fixed\nBehavior,canoncake,0.03,13.06,13.06,0,cannoncake_pinkie_pie_right.gif,cannoncake_pinkie_pie_left.gif,None,,,,False,0,0,,True,,,\"110,74\",\"85,74\",False,1,Fixed\nBehavior,canoncake2,0.02,18.16,18.16,0,cannoncake2_pinkie_pie_right.gif,cannoncake2_pinkie_pie_left.gif,None,,,,False,0,0,,True,,,\"110,74\",\"85,74\",False,1,Fixed\nBehavior,galopp,0.05,10,4,7,pinkie_galopp_right.gif,pinkie_galopp_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"77,40\",\"60,40\",False,1,Fixed\nBehavior,\"Conga Start\",0,5,5,0,jumpy_pinkiepie_right.gif,jumpy_pinkiepie_left.gif,None,Conga,,,True,0,0,,False,bounce_n_n,jumpy,\"57,78\",\"48,78\",False,1,Fixed\nBehavior,Conga,0,30,30,1,congapinkiepie_right.gif,congapinkiepie_left.gif,Horizontal_Only,,,,True,0,0,,True,,,\"44,51\",\"49,51\",False,1,Fixed\nBehavior,chicken2,0.12,10,2.4,0,chicken2_pinkie_pie_right.gif,chicken2_pinkie_pie_left.gif,None,,,,False,0,0,,True,,,\"48,46\",\"73,46\",False,1,Fixed\nBehavior,Fluttercuddle_left,0,6,6,0,fluttercuddles_links.gif,fluttercuddles_links.gif,None,,,,True,0,0,,False,,,\"99,70\",\"99,70\",False,1,Fixed\nBehavior,Fluttercuddle_right,0,6,6,0,fluttercuddles_right.gif,fluttercuddles_right.gif,None,,,,True,0,0,,False,,,\"48,70\",\"48,70\",False,1,Fixed\nBehavior,cuddle_position_left,0,5,5,3,trotcycle_pinkiepie_right.gif,trotcycle_pinkiepie_left.gif,All,Fluttercuddle_left,,,True,60,0,Fluttershy,False,stand,walk_n_n,\"45,46\",\"48,46\",False,1,Fixed\nBehavior,cuddle_position_right,0,5,5,3,trotcycle_pinkiepie_right.gif,trotcycle_pinkiepie_left.gif,All,Fluttercuddle_right,,,True,-60,0,Fluttershy,False,stand,walk_n_n,\"45,46\",\"48,46\",False,1,Fixed\nBehavior,crystallized,0.01,30,15,0,crystal-pinkie-right.gif,crystal-pinkie-left.gif,None,,,,False,0,0,,False,,,\"48,43\",\"47,43\",False,1,Fixed\nBehavior,goto_gala,0.03,10.24,5,0,stand_pinkiepie_right.gif,stand_pinkiepie_left.gif,None,gala_stand,,,False,0,0,,False,,,\"48,42\",\"47,42\",False,1,Fixed\nBehavior,gala_stand,0.1,10,5,0,gala_pinkie_idle_right.gif,gala_pinkie_idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"67,42\",\"46,42\",False,2,Fixed\nBehavior,gala_trot,0.15,10,5,3,gala_pinkie_trot_right.gif,gala_pinkie_trot_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"67,42\",\"46,42\",False,2,Fixed\nBehavior,\"gala_trot n_n\",0.15,10,5,3,gala_pinkie_trot_right_n_n.gif,gala_pinkie_trot_left_n_n_.gif,Horizontal_Only,,,,False,0,0,,True,,,\"67,42\",\"46,42\",False,2,Fixed\nBehavior,gala_bounce,0.15,10,5,2,gala_pinkie_bounce_right.gif,gala_pinkie_bounce_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"69,80\",\"46,80\",False,2,Fixed\nBehavior,\"gala_bounce n_n\",0.15,10,5,2,gala_pinkie_bounce_right_n_n.gif,gala_pinkie_bounce_left_n_n.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"69,80\",\"46,80\",False,2,Fixed\nBehavior,gala_drag,0.1,10,5,0,gala_pinkie_idle_right.gif,gala_pinkie_idle_left.gif,Dragged,,,,True,0,0,,True,,,\"67,42\",\"46,42\",False,2,Fixed\nBehavior,\"Ponko Poe gala\",0,10.24,10.24,0,gala_pinkie_idle_right.gif,gala_pinkie_idle_left.gif,None,,,,True,0,0,,True,,,\"67,42\",\"46,42\",False,2,Fixed\nBehavior,\"theme 1 gala\",0,13.6,13.6,2,gala_pinkie_bounce_right.gif,gala_pinkie_bounce_left.gif,Diagonal_horizontal,,,\"theme 1\",True,0,0,,True,,,\"69,80\",\"46,80\",False,2,Fixed\nBehavior,leave_gala,0.12,15,5,0,gala_pinkie_idle_right.gif,gala_pinkie_idle_left.gif,None,stand,,,False,0,0,,False,,,\"67,42\",\"46,42\",False,2,Fixed\nEffect,Pinkacopt_unfold,Pinkacopter_start,choppa_unfold_right.gif,choppa_unfold_left.gif,1.95,0,Center,Center,Center,Center,True,False\nEffect,sonic_pinksneeze,sneeze_fly,sonic_pinksneeze_right.gif,sonic_pinksneeze_left.gif,0.4,0,Center,Center,Center,Center,False,False\nEffect,speedlines,sneeze_fly,sonic_pinksneeze2_right.gif,sonic_pinksneeze2_left.gif,0,5,Center,Center,Center,Center,True,False\nEffect,fallingtom,parasolon2,tom.gif,tom.gif,7.4,0,Top,Center,Top,Center,False,False\nEffect,crystalspark,crystallized,sparkle.gif,sparkle.gif,0,0,Center,Center,Center,Center,True,False\nSpeak,\"Unnamed #1\",\"Twitchy tail! Twitchy tail!!\",,False,0\nSpeak,\"Unnamed #2\",\"When I was a little filly and the sun was going down~\",,False,0\nSpeak,\"Unnamed #3\",\"All you have to do is take a cup of flour and add it to the mix~\",,False,0\nSpeak,\"Unnamed #4\",\"It's a party!\",,False,0\nSpeak,\"Unnamed #5\",\"Oh the Grand Galloping Gala is the best place for me~\",,False,0\nSpeak,dash_follow,\"Hey, Dashie!\",,True,0\nSpeak,parasprite_greet,\"Ugh! A parasprite!?\",,True,0\nSpeak,pinkie_swear,\"Cross my heart and hope to fly, stick a cupcake in my eye!\",{\"pinkie pie swear.mp3\",\"pinkie pie swear.ogg\"},False,0\nSpeak,FOREVER,FOREVER!,{forever.mp3,forever.ogg},False,0\nSpeak,\"Theme 1\",\"Tons of fun!\",,True,0\nSpeak,\"Soundboard #2\",\"And you know what that means!\",{\"and you know what that means.mp3\",\"and you know what that means.ogg\"},False,0\nSpeak,\"Soundboard #3\",\"Are you loco in the coco?\",{\"are you loco in the coco.mp3\",\"are you loco in the coco.ogg\"},False,0\nSpeak,\"Soundboard #4\",Boring!,{boring.mp3,boring.ogg},False,0\nSpeak,\"Soundboard #5\",\"Eternal chaos comes with chocolate rain, you guys! Chocolate rain!\",{\"chocolate rain.mp3\",\"chocolate rain.ogg\"},False,0\nSpeak,\"Soundboard #7\",*gasp*,{gasp.mp3,gasp.ogg},False,0\nSpeak,\"Soundboard #8\",*giggle*,{giggle.mp3,giggle.ogg},False,0\nSpeak,\"Soundboard #9\",Help!,{help.mp3,help.ogg},False,0\nSpeak,\"Soundboard #10\",\"Hey! That's what I said.\",{\"hey that's what i said.mp3\",\"hey that's what i said.ogg\"},False,0\nSpeak,\"Soundboard #11\",\"Hi, I'm pinkie pie and I threw this party just for you!\",{\"hi, i'm pinkie pie...mp3\",\"hi, i'm pinkie pie...ogg\"},False,0\nSpeak,\"Soundboard #12\",\"And that's how Equestria was made.\",{\"how equestria was made.mp3\",\"how equestria was made.ogg\"},False,0\nSpeak,\"Soundboard #15\",\"I never felt joy like that before!\",{\"i never felt joy like that before.mp3\",\"i never felt joy like that before.ogg\"},False,0\nSpeak,\"Soundboard #16\",\"Wee! Let\u2019s go!\",{\"lets go.mp3\",\"lets go.ogg\"},False,0\nSpeak,\"Soundboard #18\",\"Oatmeal? Are you craz\u2026\",{\"oatmeal, are you craz....mp3\",\"oatmeal, are you craz....ogg\"},False,0\nSpeak,\"Soundboard #19\",\"Oh no!\",{\"oh no.mp3\",\"oh no.ogg\"},False,0\nSpeak,\"Soundboard #20\",\"Okie dokie lokie...\",{\"oki doki loki.mp3\",\"oki doki loki.ogg\"},False,0\nSpeak,\"Soundboard #22\",\"Pinkie Pie style!\",{\"pinkie pie style.mp3\",\"pinkie pie style.ogg\"},False,0\nSpeak,\"Soundboard #24\",\"That's so not true!\",{\"that's so not rue.mp3\",\"that's so not rue.ogg\"},False,0\nSpeak,\"Soundboard #25\",\"This calls for extreme measures!\",{\"this calls for extreme measures.mp3\",\"this calls for extreme measures.ogg\"},False,0\nSpeak,\"Soundboard #26\",\"This may look like fun, but it's not!\",{\"this may look like fun but its not.mp3\",\"this may look like fun but its not.ogg\"},False,0\nSpeak,\"Soundboard #27\",\"Twitcha-twitch! Twitcha-twitch!\",{\"twitcha twitch.mp3\",\"twitcha twitch.ogg\"},False,0\nSpeak,\"Soundboard #28\",\"You know what this calls for?\",{\"you know what this calls for.mp3\",\"you know what this calls for.ogg\"},False,0\nSpeak,\"Soundboard #29\",\"You really need to get out more.\",{\"you really need to get out more.mp3\",\"you really need to get out more.ogg\"},False,0\n", "baseurl": "ponies/pinkie%20pie/"},
                  {"ini": "Name,Pipsqueak\nCategories,\"supporting ponies\",colts,\"earth ponies\"\nBehavior,stand,0.5,30,20,0,stand_right.gif,stand_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.5,20,10,2,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,follow,0.5,30,20,2,trot_right.gif,trot_left.gif,Diagonal_horizontal,,princess,,False,-87,-87,\"Princess Luna\",True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Unnamed #1\",\"Pipsqueak the pirate, at your service.\",,False,0\nSpeak,Princess,\"Um... Princess Luna. do you suppose maybe you could come back next year and scare us again?\",,True,0\nSpeak,Scary,\"It's really fun! Scary, but fun.\",,True,0\n", "baseurl": "ponies/pipsqueak/"},
                  {"ini": "Name,\"Pokey Pierce\"\nCategories,\"supporting ponies\",stallions,unicorns\nBehavior,stand,0.25,20,15,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.25,20,15,3,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,gummy_balloon_poke,0,60,60,2,trot_right.gif,trot_left.gif,All,,,,True,0,0,Gummy,True,,,\"0,0\",\"0,0\",False,0\nBehavior,pinkie_balloon_poke,0,60,60,2,trot_right.gif,trot_left.gif,All,,,,True,0,0,\"Pinkie Pie\",True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/pokey%20pierce/"},
                  {"ini": "Name,\"Pound Cake\"\nCategories,\"supporting ponies\",colts,pegasi,foals\nBehavior,stand,0.2,12,6,0,pound-idle-right.gif,pound-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"24,35\",\"19,35\",False,0,Fixed\nBehavior,trot,0.25,8,6,2,pound-cake-trot-right.gif,pound-cake-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"27,40\",\"20,40\",False,0,Fixed\nBehavior,flight,0.15,8,6,5,pound-flight-right.gif,pound-flight-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"27,38\",\"20,40\",False,0,Fixed\nBehavior,drag,0.25,8,8,0,pound-happy-right.gif,pound-happy-left.gif,Dragged,,,,True,0,0,,True,,,\"25,36\",\"13,36\",False,0,Fixed\nBehavior,follow_mrs_cake,0.06,15,6,2,pound-cake-trot-right.gif,pound-cake-trot-left.gif,Diagonal_horizontal,,,,False,0,24,\"Mrs Cake\",True,,,\"27,40\",\"20,40\",False,0,Fixed\nBehavior,follow_mr_cake,0.1,15,6,2,pound-cake-trot-right.gif,pound-cake-trot-left.gif,Diagonal_horizontal,,,,False,0,32,\"Mr Cake\",True,,,\"27,40\",\"20,40\",False,0,Fixed\nBehavior,follow_pinkie,0.07,15,6,2,pound-cake-trot-right.gif,pound-cake-trot-left.gif,Diagonal_horizontal,,,,False,0,40,\"Pinkie Pie\",True,,,\"27,40\",\"20,40\",False,0,Fixed\nSpeak,\"Unnamed #1\",*giggle*,,False,0\n", "baseurl": "ponies/pound%20cake/"},
                  {"ini": "Name,Fili-Second\nCategories,\"main ponies\",mares,\"earth ponies\"\nBehavior,stand,0.5,15,10,0,fili-second-idle-right.gif,fili-second-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.5,15,7,4,fili-second-right.gif,fili-second-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,gallop,0.1,3,0.8,18,fili-second-gallop-right.gif,fili-second-gallop-left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nEffect,Speed1,gallop,fili-speed1-right.gif,fili-speed1-left.gif,0.35,0.04,Center,Center,Center,Center,False,True\nEffect,Speed2,gallop,fili-speed2-right.gif,fili-speed2-left.gif,0.35,0.04,Center,Center,Center,Center,False,True\nEffect,Speed3,gallop,fili-speed3-right.gif,fili-speed3-left.gif,0.35,0.04,Center,Center,Center,Center,False,True\nEffect,Speed4,gallop,fili-speed4-right.gif,fili-speed4-left.gif,0.35,0.04,Center,Center,Center,Center,False,True\nSpeak,\"Speech 1\",\"Wee! This is so much fun!\",,False,0\nSpeak,\"Speech 2\",\"Prehensile hair! Now that's something I want to try!\",,False,0\nSpeak,\"Speech 3\",Woohoo!,,False,0\nSpeak,\"Speech 4\",\"Tag you're it!\",,False,0\n", "baseurl": "ponies/pp%20fili-second/"},
                  {"ini": "Name,\"Hum Drum\"\nCategories,\"supporting ponies\",non-ponies,colts\nBehavior,stand,0.5,15,10,0,humdrum-idle-right.gif,humdrum-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.5,15,7,2,humdrum-walk-right.gif,humdrum-walk-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Speech 1\",\"When my friends need me, I always come through!\",,False,0\nSpeak,\"Speech 2\",\"You can count on me.\",,False,0\nSpeak,\"Speech 3\",\"Holy new personas, ponies!\",,False,0\nSpeak,\"Speech 4\",\"Well, I didn't now those comics were literally enchanted.\",,False,0\nSpeak,\"Speech 5\",\"Let's save Maretropolis!\",,False,0\nSpeak,\"Speech 6\",\"Once again, the day is saved!\",,False,0\n", "baseurl": "ponies/pp%20hum%20drum/"},
                  {"ini": "Name,\"Masked Matterhorn\"\nCategories,\"main ponies\",mares,alicorns\nBehavior,stand,0.4,15,10,0,masked-matterhorn-idle1-right.gif,masked-matterhorn-idle1-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.5,12,5,3,masked-matterhorn-right.gif,masked-matterhorn-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,fly,0.3,12,5,4,masked-matterhorn-fly-right.gif,masked-matterhorn-fly-left.gif,All,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Speech 1\",\"I'm the Masked Matterhorn.\",,False,0\nSpeak,\"Speech 2\",\"Humdrum may only look like a comedic sidekick to you, but for us he's a great friend!\",,False,0\nSpeak,\"Speech 3\",\"Why do I feel this urge to make ice-based puns?\",,False,0\nSpeak,\"Speech 4\",\"I never thought comics could be so... enchanting.\",,False,0\nSpeak,\"Speech 5\",\"I've lost myself in books before, but never quite like this.\",,False,0\nSpeak,\"Speech 6\",\"Let it snow.\",,False,0\nSpeak,\"Speech 7\",\"Ice powers? Does this make me 20% cooler now?\",,False,0\n", "baseurl": "ponies/pp%20masked%20matterhorn/"},
                  {"ini": "Name,\"Mistress Marevelous\"\nCategories,\"main ponies\",mares,\"earth ponies\"\nBehavior,stand,0.5,15,10,0,mistress-marevelous-idle-right.gif,mistress-marevelous-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.5,15,7,3,mistress-marevelous-right.gif,mistress-marevelous-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Speech 1\",\"What are these called? Hoofarangs?\",,False,0\nSpeak,\"Speech 2\",\"A megic lasso, eh? I think I like that.\",,False,0\nSpeak,\"Speech 3\",\"Let me show y'all how it's done!\",,False,0\nSpeak,\"Speech 4\",Yee-haw!,,False,0\nSpeak,\"Speech 5\",\"Time to Power Pony up!\",,False,0", "baseurl": "ponies/pp%20mistress%20marevelous/"},
                  {"ini": "Name,Radiance\nCategories,\"main ponies\",mares,unicorns\nBehavior,stand,0.5,15,10,0,radiance-idle-right.gif,radiance-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.5,15,7,3,radiance-right.gif,radiance-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Speech 1\",\"Making the world a prettier place, one villain at a time.\",,False,0\nSpeak,\"Speech 2\",\"Take that you ruffian!\",,False,0\nSpeak,\"Speech 3\",\"There's nothing wrong with being a stylish superhero.\",,False,0\nSpeak,\"Speech 4\",\"I'm not really a comic fan, but I appreciate the creativity going into them.\",,False,0", "baseurl": "ponies/pp%20radiance/"},
                  {"ini": "Name,\"Saddle Rager\"\nCategories,\"main ponies\",mares,pegasi\nbehaviorgroup,1,Normal\nbehaviorgroup,2,Angry\nBehavior,stand,0.4,15,10,0,saddle-rager-idle-right.gif,saddle-rager-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,walk,0.4,15,7,3,saddle-rager-right.gif,saddle-rager-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,fly,0.15,10,5,2,saddle-rager-fly-right.gif,saddle-rager-fly-left.gif,Diagonal_Vertical,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,transform,0.03,3,3,0,saddle-rager-idle-right.gif,saddle-rager-idle-left.gif,None,\"angry roar\",\"Angry 2\",,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,\"angry idle\",0.5,15,10,0,saddle-rager-mad-right.gif,saddle-rager-mad-left.gif,MouseOver,stand,,,True,0,0,,True,,,\"74,78\",\"84,78\",False,2,Fixed\nBehavior,\"angry roar\",0.5,2,2,0,saddle-rager-mad2-right.gif,saddle-rager-mad2-left.gif,None,\"angry smash\",\"Angry 3\",,True,0,0,,True,,,\"82,76\",\"90,76\",False,2,Fixed\nBehavior,\"angry smash\",0.5,5,4,0,saddle-rager-mad1-right.gif,saddle-rager-mad1-left.gif,None,\"angry idle\",\"Angry 1\",,True,0,0,,True,,,\"158,90\",\"126,90\",False,2,Fixed\nSpeak,\"Speech 1\",\"Crime-fighting? Oh my, that sounds dangerous.\",,False,1\nSpeak,\"Speech 2\",\"I'll just stay here and not get in the way, if you don't mind.\",,False,1\nSpeak,\"Speech 3\",\"Become a monster? Oh, gosh! That wouldn't... be very... polite.\",,False,1\nSpeak,\"Speech 4\",\"Sorry, I'm not feeling angry. A little concerned, maybe...\",,False,1\nSpeak,\"Speech 5\",\"Couldn't this comic just be about knitting?\",,False,1\nSpeak,\"Angry 1\",\"Why don't you pick on someone your OWN SIZE??\",,True,2\nSpeak,\"Angry 2\",\"You big MEANIE!!\",,True,1\nSpeak,\"Angry 3\",ROOAARRRR!!!,,True,2\n", "baseurl": "ponies/pp%20saddle%20rager/"},
                  {"ini": "Name,Zapp\nCategories,\"main ponies\",mares,pegasi\nBehavior,stand,0.5,15,10,0,zapp-idle-right.gif,zapp-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.5,15,7,3,zapp-right.gif,zapp-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,fly,0.2,5,2,5,zapp-fly-right.gif,zapp-fly-left.gif,Diagonal_Vertical,,,,False,0,0,,True,,,\"45,42\",\"39,42\",False,0,Fixed\nSpeak,\"Speech 1\",\"Prepare to get 'zapped'!\",,False,0\nSpeak,\"Speech 2\",\"I knew I was awesome before, but now I'm like 'super-awesome'!\",,False,0\nSpeak,\"Speech 3\",\"This is undeniably, unquestionably awesome!\",,False,0\nSpeak,\"Speech 4\",\"I'm a one-mare force of nature!\",,False,0\n", "baseurl": "ponies/pp%20zapp/"},
                  {"ini": "Name,\"Prince Blueblood\"\nCategories,stallions,unicorns,\"supporting ponies\"\nBehavior,stand,0.4,15,5,0,blueblood-idle-right.gif,blueblood-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"51,60\",\"36,60\",False,0\nBehavior,walk,0.5,15,7,2,blueblood-trot-right.gif,blueblood-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"51,64\",\"38,64\",False,0\nSpeak,\"Speech 1\",\"My royal lips have touched common carnival fare!\",,False,0\nSpeak,\"Speech 2\",\"Ewww...! Stay back! I just had myself groomed!\",,False,0\nSpeak,\"Speech 3\",\"I'm going to the buffet for some hors d'oeuvres.\",,False,0\n", "baseurl": "ponies/prince%20blueblood/"},
                  {"ini": "Name,\"Princess Cadance\"\nCategories,\"supporting ponies\",mares,alicorns\nBehavior,stand,0.1,20,10,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"63,58\",\"50,58\",False,0\nBehavior,walk,0.15,10,5,2,cadance-trot-right.gif,cadance-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"65,58\",\"50,58\",False,0\nBehavior,flight,0.18,8,4,2,cadance-flight-right.gif,cadance-flight-left.gif,All,,,,False,0,0,,True,,,\"65,66\",\"50,66\",False,0\nBehavior,deal_cadance,0.05,3.7,3.5,0,stand_right.gif,stand_left.gif,None,,,,True,0,0,Shopkeeper,True,,,\"63,58\",\"50,58\",True,0\n", "baseurl": "ponies/princess%20cadance/"},
                  {"ini": "Name,\"Princess Cadance (Teenager)\"\nCategories,mares,alicorns,\"supporting ponies\"\nBehavior,stand,0.1,20,10,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.25,15,5,3,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/princess%20cadance%20%28teenager%29/"},
                  {"ini": "Name,\"Princess Celestia (Alternate Filly)\"\nCategories,\"supporting ponies\",alicorns,fillies,\"alternate art\"\nBehavior,stand,0.4,20,15,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.4,20,15,3,walking_right.gif,walking_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk_flap,0.4,20,15,3,walking_right.gif,walking_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"miss parents 1\",0,1.5,1.5,0,stand_right.gif,stand_left.gif,None,\"miss parents 2\",,\"yes luna\",True,0,0,\"Princess Luna (Season 1)\",True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"miss parents 2\",0,3,3,0,stand_right.gif,stand_left.gif,None,,,\"me too\",True,0,0,\"Princess Luna (Season 1)\",True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"alfalfa monster\",0,3,3,0,stand_right.gif,stand_left.gif,None,\"alfalfa monster 2\",\"must eat\",\"hooves off\",True,0,0,\"Princess Luna (Season 1)\",True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"alfalfa monster 2\",0,3,3,0,stand_right.gif,stand_left.gif,None,\"alfalfa monster 3\",,munch,True,0,0,\"Princess Luna (Season 1)\",True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"alfalfa monster 3\",0,3,3,0,stand_right.gif,stand_left.gif,None,walk,,\"alfafa monster\",True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,flapping,0,1.5,1.5,0,fly_right.gif,fly_left.gif,None,walk_flap,,\"you can do it\",True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,sleep,0.15,60,30,0,sleep_right.gif,sleep_left.gif,Sleep,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Yes Luna\",\"Yes, Luna?\",,True,0\nSpeak,\"Me too\",\"\u2026Me too.\",,True,0\nSpeak,\"Must eat\",\"A princess must eat her alfalfa before desert.\",,True,0\nSpeak,\"Hooves off\",\"Hooves off the table, please.\",,True,0\nSpeak,Munch,\"...munch munch -__-\",,True,0\nSpeak,\"Alfafa Monster\",\"Bleeeeeeh! Alfalfa monster!\",,True,0\nSpeak,\"You can do it\",\"You're doing great! Just keep flapping!\",,True,0\nSpeak,\"Soundboard #1\",Gotcha!,{gotcha.mp3,gotcha.ogg},False,0\nSpeak,\"Soundboard #2\",\"I knew you could do it.\",{\"i knew you could do it.mp3\",\"i knew you could do it.ogg\"},False,0\nSpeak,\"Soundboard #3\",\"I'm so proud of you.\",{\"i'm so proud of you.mp3\",\"i'm so proud of you.ogg\"},False,0\nSpeak,\"Soundboard #4\",\"I, Princess Celestia, hereby decree\u2026!\",{\"i princess celestia hereby decree.mp3\",\"i princess celestia hereby decree.ogg\"},False,0\nSpeak,\"Soundboard #5\",Run!,{run.mp3,run.ogg},False,0\nSpeak,\"Soundboard #6\",\"These creatures are adorable!\",{\"these creatures are adorable.mp3\",\"these creatures are adorable.ogg\"},False,0\nSpeak,\"Soundboard #7\",\"I want you right by my side the entire evening.\",{\"want you by my side.mp3\",\"want you by my side.ogg\"},False,0\nSpeak,\"Soundboard #8\",\"Will you accept my friendship?\",{\"will you accept my friendship.mp3\",\"will you accept my friendship.ogg\"},False,0\n", "baseurl": "ponies/princess%20celestia%20%28alternate%20filly%29/"},
                  {"ini": "Name,\"Princess Celestia (Filly)\"\nCategories,\"supporting ponies\",fillies,alicorns\nBehavior,stand,0.05,10,5,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,flap,0.05,10,5,0,flap_right.gif,flap_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.15,15,7,3,walk_right.gif,walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,sleep,0.05,15,7,3,sleep_right.gif,sleep_left.gif,Sleep,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,sit,0.05,10,5,0,sit_right.gif,sit_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Unnamed #1\",\"Hee hee!\",,False,0\nSpeak,\"Unnamed #2\",Luna!,,False,0\n", "baseurl": "ponies/princess%20celestia%20%28filly%29/"},
                  {"ini": "Name,\"Princess Celestia\"\nCategories,\"supporting ponies\",mares,alicorns\nBehavior,stand,0.1,15,10,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.15,15,10,1,walk_right.gif,walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"theme 1\",0,3.5,3.5,0,stand_right.gif,stand_left.gif,None,\"theme 2\",\"my little pony\",ah-ah-ah-ah,True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"theme 2\",0,2,2,1,walk_right.gif,walk_left.gif,Diagonal_horizontal,\"theme 3\",,\"title drop\",True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"theme 3\",0,4,4,1,walk_right.gif,walk_left.gif,Diagonal_horizontal,\"theme 4\",,\"title drop\",True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"theme 5\",0,3,3,1,walk_right.gif,walk_left.gif,Diagonal_horizontal,\"theme 6\",,\"title drop\",True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"theme 6\",0,4.5,4.5,0,stand_right.gif,stand_left.gif,None,,,friends,True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"theme 4\",0,9,9,1,walk_right.gif,walk_left.gif,Diagonal_horizontal,\"theme 5\",,\"easy feat\",True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"tomorrow 1\",0,8,8,0,stand_right.gif,stand_left.gif,None,\"tomorrow 2\",\"tomorrow 1\",\"tomorrow 2\",True,0,0,\"Nightmare Moon\",True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"tomorrow 2\",0,3,3,0,stand_right.gif,stand_left.gif,None,\"tomorrow 3\",,\"tomorrow 3\",True,0,0,\"Nightmare Moon\",True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"tomorrow 3\",0,5,5,0,stand_right.gif,stand_left.gif,None,,,\"tomorrow 4\",True,0,0,\"Nightmare Moon\",True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,parasprite_follow_circle,0,60,60,2,walk_right.gif,walk_left.gif,Diagonal_horizontal,,,,True,0,0,\"Pinkie Pie\",True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,fly,0.15,15,10,1,fly_right.gif,fly_left.gif,Diagonal_Vertical,,,,False,0,0,,True,,,\"96,84\",\"95,84\",False,0,Fixed\nBehavior,scroll_arrive,0.15,3.2,3.2,0,scroll_arrive_right.gif,scroll_arrive_left.gif,None,,,,False,0,0,,True,,,\"96,100\",\"95,100\",False,0,Fixed\nBehavior,deal_celestia,0.05,3.7,3.5,0,stand_right.gif,stand_left.gif,None,,,,True,0,0,Shopkeeper,True,,,\"0,0\",\"0,0\",True,0,Fixed\nSpeak,\"Unnamed #1\",\"My faithful student!\",,False,0\nSpeak,\"My little Pony\",\"My Little Pony, My Little Pony!\",,True,0\nSpeak,Ah-ah-ah-ah,\"Ah- ah-AH-AH!\",,True,0\nSpeak,\"Title Drop\",\"My Little Pony!\",,True,0\nSpeak,Friends,Friends!,,True,0\nSpeak,\"Easy feat\",\"It's an easy feat!\",,True,0\nSpeak,\"Tomorrow 1\",\"Luna, can you hear me?\",,True,0\nSpeak,\"Tomorrow 2\",\"I know you're in there somewhere...\",,True,0\nSpeak,\"Tomorrow 3\",\"Can't you come back to me?\",,True,0\nSpeak,\"Tomorrow 4\",\"Until tomorrow night, Luna...\",,True,0\nSpeak,\"Soundboard #1\",Gotcha!,{gotcha.mp3,gotcha.ogg},False,0\nSpeak,\"Soundboard #2\",\"I knew you could do it.\",{\"i knew you could do it.mp3\",\"i knew you could do it.ogg\"},False,0\nSpeak,\"Soundboard #3\",\"I'm so proud of you.\",{\"i'm so proud of you.mp3\",\"i'm so proud of you.ogg\"},False,0\nSpeak,\"Soundboard #4\",\"I princess celestia hereby decree...!\",{\"i princess celestia hereby decree.mp3\",\"i princess celestia hereby decree.ogg\"},False,0\nSpeak,\"Soundboard #5\",Run!,{run.mp3,run.ogg},False,0\nSpeak,\"Soundboard #6\",\"These creatures are adorable!\",{\"these creatures are adorable.mp3\",\"these creatures are adorable.ogg\"},False,0\nSpeak,\"Soundboard #7\",\"I want you right by my side the entire evening.\",{\"want you by my side.mp3\",\"want you by my side.ogg\"},False,0\nSpeak,\"Soundboard #8\",\"Will you accept my friendship?\",{\"will you accept my friendship.mp3\",\"will you accept my friendship.ogg\"},False,0\n", "baseurl": "ponies/princess%20celestia/"},
                  {"ini": "Name,\"Princess Luna (Filly)\"\nCategories,\"supporting ponies\",fillies,alicorns\nBehavior,stand,0.1,15,7,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,fly,0.25,15,7,2,fly_right.gif,fly_left.gif,Diagonal_Vertical,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.15,15,7,3,walk_right.gif,walk_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk_flap,0.15,15,7,3,walk_flap_right.gif,walk_flap_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"miss parents 1\",0,3,3,0,stand_right.gif,stand_left.gif,None,\"follow sister\",\"hey tia\",\"miss parents\",True,0,0,\"Princess Celestia (Alternate Filly)\",True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"follow sister\",0.05,60,60,3,walk_right.gif,walk_left.gif,All,,,,False,0,0,\"Princess Celestia (Alternate Filly)\",True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"alfalfa monster\",0,1.5,1.5,0,stand_right.gif,stand_left.gif,None,\"alfalfa monster 2\",,\"gross and dumb\",True,0,0,\"Princess Celestia (Alternate Filly)\",True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"alfalfa monster 2\",0,3,3,0,stand_right.gif,stand_left.gif,None,\"alfalfa monster 3\",,\"don't eat\",True,0,0,\"Princess Celestia (Alternate Filly)\",True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"alfalfa monster 3\",0,3,3,0,stand_right.gif,stand_left.gif,None,\"alfalfa monster 4\",,happy,True,0,0,\"Princess Celestia (Alternate Filly)\",True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"alfalfa monster 4\",0,3,3,0,stand_right.gif,stand_left.gif,None,\"follow sister\",,\"alfalfa monster\",True,0,0,\"Princess Celestia (Alternate Filly)\",True,,,\"0,0\",\"0,0\",False,0\nBehavior,\"follow sister 2\",0,60,60,3,fly_right.gif,fly_left.gif,All,,,,True,0,0,\"Princess Celestia (Alternate Filly)\",True,,,\"0,0\",\"0,0\",False,0\nBehavior,flapping,0,3,3,0,fly_right.gif,fly_left.gif,None,\"follow sister 2\",flapping,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,sleeping,0.07,60,30,0,sleeping_right.gif,sleeping_left.gif,Sleep,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Alfalfa Monster\",\"Ewwwww, nooo! x3\",,True,0\nSpeak,\"Hey Tia\",\"Hey,Tia?\",,True,0\nSpeak,\"Miss parents\",\"I miss Mom and Dad.\",,True,0\nSpeak,\"Gross and Dumb\",\"But it's DUMB and GROSS and I hate it and it's a stupid color and besides-\",,True,0\nSpeak,\"Don't eat\",\"You NEVER eat your alfalfa.\",,True,0\nSpeak,Flapping,\"*flap flap flap*\",,True,0\nSpeak,Happy,^__^,,True,0\n", "baseurl": "ponies/princess%20luna%20%28filly%29/"},
                  {"ini": "Name,\"Princess Luna\"\nCategories,\"supporting ponies\",mares,alicorns\nBehavior,stand,0.1,15,5,0,luna_idle_right.gif,luna_idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"72,64\",\"72,64\",False,0\nBehavior,walk,0.15,10,5,1,luna_walk_right.gif,luna_walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"72,64\",\"72,64\",False,0\nBehavior,flight,0.1,8,4,2,luna-flight-right.gif,luna-flight-left.gif,All,,,,False,0,0,,True,,,\"72,68\",\"72,68\",False,0\nBehavior,\"NMM Luna\",0,5,5,0,luna_idle_right.gif,luna_idle_left.gif,None,,NMM,,True,0,0,\"Nightmare Moon\",True,,,\"72,64\",\"72,64\",False,0\nSpeak,\"Unnamed #1\",\"TOGETHER, WE SHALL TURN THIS DREADFUL NIGHT INTO A GLORIOUS FEEEEAAAAST!\",,False,0\nSpeak,\"Unnamed #2\",\"OH MOST WON... I mean, oh most wonderful of nights!\",{\"most wonderful of nights.mp3\",\"most wonderful of nights.ogg\"},False,0\nSpeak,\"Unnamed #3\",\"WE COULD NOT BE HAPPIER! IS THAT NOT CLEAR?\",{\"we could not be happier. is that not clear.mp3\",\"we could not be happier. is that not clear.ogg\"},False,0\nSpeak,\"Unnamed #4\",\"THIS IS THE TRADITIONAL ROYAL CANTERLOT VOICE!\",,False,0\nSpeak,NMM,\"BEGONE, VILE SPIRIT! WE ARE UNDER THY CONTROL NO LONGER!\",,True,0\nSpeak,\"Unnamed #5\",\"Forgive me if I withold my enthusiasm.\",{\"forgive me if i withhold my enthusiasm.mp3\",\"forgive me if i withhold my enthusiasm.ogg\"},False,0\nSpeak,\"Unnamed #6\",HUZZAH!,{huzzah!.mp3,huzzah!.ogg},False,0\nSpeak,\"Unnamed #7\",\"Fun? What is this fun thou speakest of?\",{\"fun  what is this fun thou speakest of.mp3\",\"fun  what is this fun thou speakest of.ogg\"},False,0\nSpeak,\"Unnamed #8\",\"What is the matter with you!?\",{\"what is the matter with you.mp3\",\"what is the matter with you.ogg\"},False,0\nSpeak,\"Unnamed #9\",\"Very well then, be that way!\",{\"very well then, be that way.mp3\",\"very well then, be that way.ogg\"},False,0\nSpeak,\"Unnamed #10\",\"Haha! The fun has been doubled!\",{\"the fun has been doubled!.mp3\",\"the fun has been doubled!.ogg\"},False,0\n", "baseurl": "ponies/princess%20luna/"},
                  {"ini": "Name,\"Princess Luna (Season 1)\"\nCategories,\"supporting ponies\",mares,alicorns\nBehavior,stand,0.1,15,7,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,fly,0.25,15,7,2,fly_right.gif,fly_left.gif,Diagonal_Vertical,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.15,15,7,3,walking_right.gif,walking_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk_wing,0.15,15,7,3,walking_wing_right.gif,walking_wing_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"miss parents 1\",0,3,3,0,stand_right.gif,stand_left.gif,None,\"follow sister\",\"hey tia\",\"miss parents\",True,0,0,\"Princess Celestia (Alternate Filly)\",True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"follow sister\",0.05,60,60,3,walking_right.gif,walking_left.gif,All,,,,False,0,0,\"Princess Celestia (Alternate Filly)\",False,stand,walk,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"alfalfa monster\",0,1.5,1.5,0,stand_right.gif,stand_left.gif,None,\"alfalfa monster 2\",,\"gross and dumb\",True,0,0,\"Princess Celestia (Alternate Filly)\",True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"alfalfa monster 2\",0,3,3,0,stand_right.gif,stand_left.gif,None,\"alfalfa monster 3\",,\"don't eat\",True,0,0,\"Princess Celestia (Alternate Filly)\",True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"alfalfa monster 3\",0,3,3,0,stand_right.gif,stand_left.gif,None,\"alfalfa monster 4\",,happy,True,0,0,\"Princess Celestia (Alternate Filly)\",True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"alfalfa monster 4\",0,3,3,0,stand_right.gif,stand_left.gif,None,\"follow sister\",,\"alfalfa monster\",True,0,0,\"Princess Celestia (Alternate Filly)\",True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"follow sister 2\",0,60,60,3,fly_right.gif,fly_left.gif,All,,,,True,0,0,\"Princess Celestia (Alternate Filly)\",True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,flapping,0,3,3,0,fly_right.gif,fly_left.gif,None,\"follow sister 2\",flapping,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,sleeping,0.07,60,30,0,sleeping_right.gif,sleeping_left.gif,Sleep,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,happy_jump,0.05,20,15,3,luna_happy_jump_right.gif,luna_happy_jump_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"51,83\",\"50,83\",False,0,Fixed\nBehavior,Magic,0.1,10,5,0,magic_right.gif,magic_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nEffect,Magic,Magic,luna_abacus.gif,luna_abacus.gif,0,0,Right,Left,Left,Right,False,False\nSpeak,\"Alfalfa Monster\",\"Ewwwww nooo! x3\",,True,0\nSpeak,\"Hey Tia\",\"Hey, Tia?\",,True,0\nSpeak,\"Miss parents\",\"I miss mom and dad.\",,True,0\nSpeak,\"Gross and Dumb\",\"But it's DUMB and GROSS and I hate it and it's a stupid color and besides-\",,True,0\nSpeak,\"Don't eat\",\"You NEVER eat your alfalfa.\",,True,0\nSpeak,Happy,^__^,,True,0\nSpeak,Abacus,\"Where's Abacus disappeared to now?\",,False,0\nSpeak,Flapping,\"*flap, flap, flap*\",,True,0\nSpeak,\"Soundboard #1\",\"I missed you so much!\",{\"i missed you so much.mp3\",\"i missed you so much.ogg\"},False,0\nSpeak,\"Soundboard #2\",\"I'm so sorry!\",{\"i'm so sorry.mp3\",\"i'm so sorry.ogg\"},False,0\n", "baseurl": "ponies/princess%20luna%20%28season%201%29/"},
                  {"ini": "Name,\"Princess Twilight Sparkle\"\nCategories,\"main ponies\",mares,alicorns\nbehaviorgroup,1,Normal\nbehaviorgroup,2,\"Coronation Dress\"\nBehavior,stand,0.15,15,5,0,p-twi-idle-right.gif,p-twi-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"55,42\",\"42,42\",False,1,Fixed\nBehavior,\"stand r\",0.15,15,5,0,p-twi-idle-right.gif,p-twi-idle-right.gif,None,,,,True,0,0,,True,,,\"55,42\",\"55,42\",False,1,Fixed\nBehavior,\"stand l\",0.15,15,5,0,p-twi-idle-left.gif,p-twi-idle-left.gif,None,,,,True,0,0,,True,,,\"42,42\",\"42,42\",False,1,Fixed\nBehavior,walk,0.2,15,3,3,p-twi-trot-right.gif,p-twi-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"55,44\",\"42,44\",False,1,Fixed\nBehavior,walk-wings,0.2,15,3,3,p-twi-trot-wings-right.gif,p-twi-trot-wings-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"55,44\",\"42,44\",False,1,Fixed\nBehavior,fly,0.3,12,5,4,p-twi-flight-right.gif,p-twi-flight-left.gif,All,,,,False,0,0,,True,,,\"55,46\",\"44,46\",False,1,Fixed\nBehavior,zoom,0.05,5,2,18,princess-twilight-zoom-right.gif,princess-twilight-zoom-left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"71,52\",\"47,52\",False,1,Fixed\nBehavior,starswirl,0.01,24,8,3,twilight-starswirl-right.gif,twilight-starswirl-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"57,84\",\"50,84\",False,1,Fixed\nBehavior,\"transformation start r\",0.02,1.4,1.4,0,p-twi-trans-right.gif,p-twi-trans-right.gif,None,\"dress transformation finish r\",,,False,0,0,,True,,,\"55,48\",\"55,48\",False,1,Fixed\nBehavior,\"transformation finish r\",0.05,1.4,1.4,0,p-twi-trans-right1.gif,p-twi-trans-right1.gif,None,\"stand r\",,,True,0,0,,True,,,\"57,50\",\"57,50\",False,1,Fixed\nBehavior,\"transformation start l\",0.02,1.4,1.4,0,p-twi-trans-left.gif,p-twi-trans-left.gif,None,\"dress transformation finish l\",,,False,0,0,,True,,,\"54,48\",\"54,48\",False,1,Fixed\nBehavior,\"transformation finish l\",0.05,1.4,1.4,0,p-twi-trans-left1.gif,p-twi-trans-left1.gif,None,\"stand l\",,,True,0,0,,True,,,\"54,50\",\"54,50\",False,1,Fixed\nBehavior,\"dress stand\",0.15,15,5,0,princess-twilight-idle-right.gif,princess-twilight-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"57,54\",\"40,54\",False,2,Fixed\nBehavior,\"dress stand r\",0.15,15,5,0,princess-twilight-idle-right.gif,princess-twilight-idle-right.gif,None,,,,True,0,0,,True,,,\"57,54\",\"57,54\",False,2,Fixed\nBehavior,\"dress stand l\",0.15,15,5,0,princess-twilight-idle-left.gif,princess-twilight-idle-left.gif,None,,,,True,0,0,,True,,,\"40,54\",\"40,54\",False,2,Fixed\nBehavior,\"dress walk\",0.2,15,3,3,princess-twilight-trot-right.gif,princess-twilight-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"59,58\",\"40,58\",False,2,Fixed\nBehavior,\"dress walk-wings\",0.2,15,3,3,princess-twilight-trot-wings-right.gif,princess-twilight-trot-wings-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"59,58\",\"40,58\",False,2,Fixed\nBehavior,\"dress fly\",0.3,12,5,4,princess-twilight-flight-right.gif,princess-twilight-flight-left.gif,All,,,,False,0,0,,True,,,\"57,60\",\"42,60\",False,2,Fixed\nBehavior,\"dress transformation start r\",0.1,1.4,1.4,0,p-twi-trans-dress-right.gif,p-twi-trans-dress-right.gif,None,\"transformation finish r\",,,False,0,0,,True,,,\"57,54\",\"57,54\",False,2,Fixed\nBehavior,\"dress transformation finish r\",0.05,1.4,1.4,0,p-twi-trans-dress-right1.gif,p-twi-trans-dress-right1.gif,None,\"dress stand r\",,,True,0,0,,True,,,\"57,54\",\"57,54\",False,2,Fixed\nBehavior,\"dress transformation start l\",0.1,1.4,1.4,0,p-twi-trans-dress-left.gif,p-twi-trans-dress-left.gif,None,\"transformation finish l\",,,False,0,0,,True,,,\"54,54\",\"54,54\",False,2,Fixed\nBehavior,\"dress transformation finish l\",0.05,1.4,1.4,0,p-twi-trans-dress-left1.gif,p-twi-trans-dress-left1.gif,None,\"dress stand l\",,,True,0,0,,True,,,\"54,54\",\"54,54\",False,2,Fixed\nEffect,starburst,zoom,starburst-big.gif,starburst-big.gif,4,0,Center,Center,Center,Center,False,True\nSpeak,\"Unnamed #1\",Spiiiiike?,,False,0\nSpeak,\"Unnamed #2\",\"I should really get back to studying...\",,False,0\nSpeak,\"Unnamed #3\",\"Cross my heart and hope to fly, stick a cupcake in my-- OW!\",,False,0\nSpeak,\"Unnamed #4\",\"Everything is gonna be fine.\",,False,0\nSpeak,\"Unnamed #5\",\"Is there a book I can read on how to be a princess?.\",,False,0\n", "baseurl": "ponies/princess%20twilight%20sparkle/"},
                  {"ini": "Name,\"Pumpkin Cake\"\nCategories,\"supporting ponies\",fillies,unicorns,foals\nBehavior,stand,0.2,12,6,0,pumpkin-idle-right.gif,pumpkin-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"22,39\",\"19,39\",False,0,Fixed\nBehavior,trot,0.25,8,6,2,pumpkin-cake-trot-right.gif,pumpkin-cake-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"23,44\",\"20,44\",False,0,Fixed\nBehavior,drag,0.25,8,8,0,pumpkin-happy-right.gif,pumpkin-happy-left.gif,Dragged,,,,True,0,0,,True,,,\"22,38\",\"13,38\",False,0,Fixed\nBehavior,follow_mrs_cake,0.06,15,6,2,pumpkin-cake-trot-right.gif,pumpkin-cake-trot-left.gif,Diagonal_horizontal,,,,False,0,24,\"Mrs Cake\",True,,,\"23,44\",\"20,44\",False,0,Fixed\nBehavior,follow_mr_cake,0.1,15,6,2,pumpkin-cake-trot-right.gif,pumpkin-cake-trot-left.gif,Diagonal_horizontal,,,,False,0,32,\"Mr Cake\",True,,,\"23,44\",\"20,44\",False,0,Fixed\nBehavior,follow_pinkie,0.07,15,6,2,pumpkin-cake-trot-right.gif,pumpkin-cake-trot-left.gif,Diagonal_horizontal,,,,False,0,40,\"Pinkie Pie\",True,,,\"23,44\",\"20,44\",False,0,Fixed\nSpeak,\"Unnamed #1\",*giggle*,,False,0\n", "baseurl": "ponies/pumpkin%20cake/"},
                  {"ini": "Name,\"Queen Chrysalis\"\nCategories,mares,alicorns,non-ponies\nBehavior,stand,0.1,15,5,0,chrysalis-idle-right.gif,chrysalis-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"55,76\",\"38,76\",False,0,Fixed\nBehavior,walk,0.05,10,3,1.8,chrysalis-trot-right.gif,chrysalis-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"55,76\",\"38,76\",False,0,Fixed\nBehavior,walk2,0.1,10,3,1.8,chrysalis-walk-right.gif,chrysalis-walk-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"55,76\",\"38,76\",False,0,Fixed\nBehavior,flight,0.1,2,0.5,5,chrysalis-flight-right.gif,chrysalis-flight-left.gif,Diagonal_Vertical,,,,False,0,0,,True,,,\"57,84\",\"38,84\",False,0,Fixed\nSpeak,\"Unnamed #1\",\"\u266b This day is going to be perfect \u266a\",,False,0\n", "baseurl": "ponies/queen%20chrysalis/"},
                  {"ini": "Name,\"Rainbow Dash (Filly)\"\nCategories,\"main ponies\",fillies,pegasi\nBehavior,Stand,0.1,5.96,5.96,0,stand_filly_dash_right.gif,stand_filly_dash_left.gif,MouseOver,,,,False,0,0,,True,,,\"41,36\",\"48,36\",False,0,Fixed\nBehavior,Trot,0.15,16,4,3,trot_filly_dash_right.gif,trot_filly_dash_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"46,42\",\"37,42\",False,0,Fixed\nBehavior,FlyFast,0.15,6.4,0.64,4,flyfast_filly_dash_right.gif,flyfast_filly_dash_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,RainBoom1,0.05,1.82,1.82,0,rainboom1_filly_dash_right.gif,rainboom1_filly_dash_left.gif,None,RainBoom2,finishline,,False,0,0,,True,,,\"41,36\",\"48,36\",False,0,Fixed\nBehavior,RainBoom2,0,1.92,1.92,5,flyfast_filly_dash_right.gif,flyfast_filly_dash_left.gif,Horizontal_Only,RainBoom3,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,RainBoom3,0,0.36,0.36,10,rainboom3_filly_dash_right.gif,rainboom3_filly_dash_left.gif,Horizontal_Only,RainBoom4,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,RainBoom4,0,0.64,0.64,15,flysonic_filly_dash_right.gif,flysonic_filly_dash_left.gif,Horizontal_Only,RainBoom5,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,RainBoom5,0,2.56,2.56,20,flyfast_filly_dash_right.gif,flyfast_filly_dash_left.gif,Diagonal_horizontal,,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,Fly,0.2,4,0.8,4,fly_filly_dash_right.gif,fly_filly_dash_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"49,42\",\"36,42\",False,0,Fixed\nBehavior,Hover,0.15,4,0.8,2,flyup_filly_dash_right.gif,flyup_filly_dash_left.gif,Vertical_Only,,,,False,0,0,,True,,,\"49,42\",\"36,42\",False,0,Fixed\nBehavior,Leap_start,0.05,1,1,1,leapstart_right.gif,leapstart_left.gif,None,Leap,,,False,0,0,,False,,,\"43,36\",\"54,36\",True,0,Fixed\nBehavior,Leap,0.05,0.38,0.38,24,leap_right.gif,leap_left.gif,Horizontal_Only,Leap_end,,,True,0,0,,False,,,\"55,44\",\"60,44\",True,0,Fixed\nBehavior,Leap_end,0.05,2.2,1,1,leapend_right.gif,leapend_left.gif,None,,,,True,0,0,,False,,,\"51,43\",\"40,43\",True,0,Fixed\nEffect,Rainbow,RainBoom5,rainbow_effect.gif,rainbow_effect.gif,0.6,0.01,Center,Center,Center,Center,False,False\nEffect,Rainboom,RainBoom5,rainboomtest.gif,rainboomtest.gif,0.95,0,Center,Center,Center,Center,False,False\nSpeak,Hey,Hey!,,False,0\nSpeak,FinishLine,\"See you boys at the finish line!\",,False,0\nSpeak,Awesome,Awesome!,,False,0\n", "baseurl": "ponies/rainbow%20dash%20%28filly%29/"},
                  {"ini": "Name,\"Rainbow Dash\"\nCategories,\"main ponies\",mares,pegasi\nBehavior,stand,0.1,10,5,0,stand_rainbow_right.gif,stand_rainbow_left.gif,MouseOver,,,,False,0,0,,True,,,\"53,42\",\"44,42\",False,0,Fixed\nBehavior,flyzoom,0.05,5,5,20,flyzoom_rainbow_right.gif,flyzoom_rainbow_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"66,48\",\"39,48\",False,0,Fixed\nBehavior,fly,0.2,5,2,5,fly_rainbow_right.gif,fly_rainbow_left.gif,Diagonal_Vertical,,,,False,0,0,,True,,,\"50,44\",\"49,44\",False,0,Fixed\nBehavior,dash,0.25,5,2,5,fly_rainbow_right.gif,fly_rainbow_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"50,44\",\"49,44\",False,0,Fixed\nBehavior,walk,0.1,5,5,3,trotcycle_rainbow_right.gif,trotcycle_rainbow_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"51,42\",\"46,42\",False,0,Fixed\nBehavior,walk_wings,0.15,5,5,3,trotcycle_rainbow_wing_right.gif,trotcycle_rainbow_wing_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"51,42\",\"46,42\",False,0,Fixed\nBehavior,makerain,0.01,5,2,0,cloud_jump_right.gif,cloud_jump_left.gif,None,,,,False,0,0,,True,,,\"65,165\",\"66,165\",False,0,Fixed\nBehavior,sleep,0.05,30,10,0,cloud_sleep_right.gif,cloud_sleep_left.gif,Sleep,,,,False,0,0,,True,,,\"45,35\",\"60,35\",False,0,Fixed\nBehavior,hover,0.2,5,5,2,hoverupdown_rainbow_right.gif,hoverupdown_rainbow_left.gif,Vertical_Only,,,,False,0,0,,True,,,\"51,46\",\"44,46\",False,0,Fixed\nBehavior,\"junior speedsters 1\",0,2.5,2.5,0,stand_rainbow_right.gif,stand_rainbow_left.gif,None,\"junior speedsters 2\",\"junior speedsters 1\",\"junior speedsters 2\",True,0,0,,True,,,\"51,42\",\"46,42\",False,0,Fixed\nBehavior,\"junior speedsters 2\",0,2.5,2.5,0,fly_rainbow_right.gif,fly_rainbow_left.gif,None,\"junior speedsters 3\",,\"junior speedsters 3\",True,0,0,,True,,,\"51,46\",\"48,46\",False,0,Fixed\nBehavior,\"junior speedsters 3\",0,2,2,0,fly_rainbow_right.gif,fly_rainbow_left.gif,None,\"junior speedsters 4\",,\"junior speedsters 4\",True,0,0,,True,,,\"51,46\",\"48,46\",False,0,Fixed\nBehavior,\"junior speedsters 4\",0,2,2,0,fly_rainbow_right.gif,fly_rainbow_left.gif,None,\"junior speedsters 5\",,\"junior speedsters 5\",True,0,0,,True,,,\"51,46\",\"48,46\",False,0,Fixed\nBehavior,\"junior speedsters 5\",0,2,2,0,fly_rainbow_right.gif,fly_rainbow_left.gif,None,\"junior speedsters 6\",,\"junior speedsters 6\",True,0,0,,True,,,\"51,46\",\"48,46\",False,0,Fixed\nBehavior,\"junior speedsters 6\",0,2,2,0,stand_rainbow_right.gif,stand_rainbow_left.gif,None,,,\"junior speedsters 7\",True,0,0,,True,,,\"51,42\",\"46,42\",False,0,Fixed\nBehavior,\"theme 1\",0,13,13,3,fly_rainbow_right.gif,fly_rainbow_left.gif,All,,,\"theme 1\",True,0,0,,True,,,\"51,44\",\"49,44\",False,0,Fixed\nBehavior,Galla_Dress,0.01,30,15,0,rd_galla_right.png,rd_galla_left.png,None,,,,False,0,0,,True,,,\"68,40\",\"45,40\",False,0,Fixed\nBehavior,dash_ground,0.05,10,8,5,dashing_right.gif,dashing_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"60,34\",\"47,34\",False,0,Fixed\nBehavior,dinodash,0.05,5,4,1,dinodash3_right.gif,dinodash3_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"69,14\",\"58,14\",False,0,Fixed\nBehavior,drag,0,2.4,0,0,rd_dragged_right1.gif,rd_dragged_left1.gif,Dragged,,,,False,0,0,,True,,,\"20,15\",\"55,15\",False,0,Fixed\nBehavior,RonboDosh,0,6,6,0,stand_rainbow_right.gif,stand_rainbow_left.gif,None,,,wut,True,0,0,,True,,,\"52,41\",\"45,41\",False,0,Fixed\nBehavior,beep,0.01,7.2,7.2,8,beep_right.gif,beep_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"72,33\",\"73,33\",False,0,Fixed\nBehavior,\"Conga Start\",0,5,5,10,flyzoom_rainbow_right.gif,flyzoom_rainbow_left.gif,Diagonal_horizontal,Conga,,,True,60,-40,\"Pinkie Pie\",False,stand,fly,\"66,48\",\"39,48\",False,0,Fixed\nBehavior,Conga,0,30,30,1.2,congarainbowdash_right.gif,congarainbowdash_left.gif,Horizontal_Only,,,,True,-43,1,Fluttershy,False,stand,Conga,\"43,47\",\"46,47\",False,0,Mirror\nBehavior,dizzy,0.01,10,5,0,fly_dizzy_right.gif,fly_dizzy.gif,None,,,,False,0,0,,False,,,\"50,46\",\"49,46\",False,0,Fixed\nBehavior,Salute,0.01,2.5,2.3,0,rainbow_dash_salute.gif,rainbow_dash_salute.gif,None,,,,False,0,0,,False,,,\"45,39\",\"45,39\",True,0,Fixed\nBehavior,training,0,17,17,1,rainbow_dash_motivate_right.gif,rainbow_dash_motivate_left.gif,Horizontal_Only,,training,,True,0,0,,False,,,\"53,48\",\"48,48\",False,0,Fixed\nBehavior,coaching,0.08,20,16,1,rainbow_dash_motivate_right.gif,rainbow_dash_motivate_left.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"53,48\",\"48,48\",False,0,Fixed\nBehavior,crystallized,0.01,30,15,0,crystallizedrainbow_right.png,crystallizedrainbow_left.png,None,,,,False,0,0,,False,,,\"55,50\",\"50,50\",False,0,Fixed\nEffect,rainboom,flyzoom,rainboomtest.gif,rainboomtest.gif,4,0,Center,Right,Center,Left,False,False\nEffect,\"rainboom trail\",flyzoom,rainboomtest_trail_right.gif,rainboomtest_trail_left.gif,0,0,Right,Left,Left,Right,False,False\nEffect,crystalspark,crystallized,sparkle.gif,sparkle.gif,0,0,Center,Center,Center,Center,True,False\nSpeak,\"Unnamed #1\",Hey!,,False,0\nSpeak,\"Unnamed #2\",\"What's up, brony?\",,False,0\nSpeak,\"Unnamed #3\",\"This desktop needs to be about twenty percent cooler.\",,False,0\nSpeak,\"Unnamed #4\",:3,,False,0\nSpeak,\"Theme 1\",\"Big adventure!\",,True,0\nSpeak,\"Junior Speedsters 1\",\"Sooooo? |3\",,True,0\nSpeak,\"Junior Speedsters 2\",^__^,,True,0\nSpeak,\"Junior Speedsters 3\",\"Junior Speedsters are our lives\",,True,0\nSpeak,\"Junior Speedsters 4\",\"Sky-bound soars and daring dives\",,True,0\nSpeak,\"Junior Speedsters 5\",\"Junior Speedsters; it's our quest\",,True,0\nSpeak,\"Junior Speedsters 6\",\"To someday be the very best!\",,True,0\nSpeak,\"Junior Speedsters 7\",\"^ ^\",,True,0\nSpeak,\"Soundboard #1\",\"10 seconds flat.\",{\"10 seconds flat.mp3\",\"10 seconds flat.ogg\"},False,0\nSpeak,\"Soundboard #2\",\"Are you a spy?!\",{\"are you a spy.mp3\",\"are you a spy.ogg\"},False,0\nSpeak,\"Soundboard #3\",\"This really is the BEST DAY EVER!\",{\"best day ever.mp3\",\"best day ever.ogg\"},False,0\nSpeak,\"Soundboard #4\",Booo!,{booo.mp3,booo.ogg},False,0\nSpeak,\"Soundboard #5\",\"*fangirl squeal*\",{\"fangirl squeal.mp3\",\"fangirl squeal.ogg\"},False,0\nSpeak,\"Soundboard #6\",\"Get off there and put em up!\",{\"get off there and put em up.mp3\",\"get off there and put em up.ogg\"},False,0\nSpeak,\"Soundboard #7\",\"I am the iron pony!\",{\"i am the iron pony.mp3\",\"i am the iron pony.ogg\"},False,0\nSpeak,\"Soundboard #8\",\"I hate losing.\",{\"i hate losing.mp3\",\"i hate losing.ogg\"},False,0\nSpeak,\"Soundboard #9\",\"I know, it's gonna be so awesome!\",{\"i know it's gonna be so awesome.mp3\",\"i know it's gonna be so awesome.ogg\"},False,0\nSpeak,\"Soundboard #10\",\"I love fun things!\",{\"i love fun things.mp3\",\"i love fun things.ogg\"},False,0\nSpeak,\"Soundboard #11\",\"I'm on it!\",{\"i'm on it.mp3\",\"i'm on it.ogg\"},False,0\nSpeak,\"Soundboard #12\",\"It needs to be about 20% cooler.\",{\"it needs to be about 20% cooler.mp3\",\"it needs to be about 20% cooler.ogg\"},False,0\nSpeak,\"Soundboard #13\",\"Yes, it's all true.\",{\"it's all true.mp3\",\"it's all true.ogg\"},False,0\nSpeak,\"Soundboard #14\",*laughing*,{laughing.mp3,laughing.ogg},False,0\nSpeak,\"Soundboard #15\",Louder!,{louder.mp3,louder.ogg},False,0\nSpeak,\"Soundboard #16\",\"My life is ruined!\",{\"my life is ruined.mp3\",\"my life is ruined.ogg\"},False,0\nSpeak,\"Soundboard #17\",\"Not cool!\",{\"not cool.mp3\",\"not cool.ogg\"},False,0\nSpeak,\"Soundboard #18\",omgomgomg,{omgomgomg.mp3,omgomgomg.ogg},False,0\nSpeak,\"Soundboard #19\",\"Pinkie Pie, you are so random!\",{\"pinkie u so random.mp3\",\"pinkie u so random.ogg\"},False,0\nSpeak,\"Soundboard #20\",\"Sounds like sour apples to me.\",{\"sounds like sour apples to me.mp3\",\"sounds like sour apples to me.ogg\"},False,0\nSpeak,\"Soundboard #21\",\"Time to take out the adorable trash!\",{\"time to take out the adorable trash.mp3\",\"time to take out the adorable trash.ogg\"},False,0\nSpeak,\"Soundboard #22\",\"What do you have in mind?\",{\"what do you have in mind.mp3\",\"what do you have in mind.ogg\"},False,0\nSpeak,\"Soundboard #23\",\"Who are you calling a chump, chump?\",{\"who are you calling a chump.mp3\",\"who are you calling a chump.ogg\"},False,0\nSpeak,\"Soundboard #24\",\"You don't wanna know.\",{\"you dont wanna know.mp3\",\"you dont wanna know.ogg\"},False,0\nSpeak,\"Soundboard #25\",\"Oh, you wanna do this the hard way? We'll do this the hard way!\",{\"you wanna do this the hard way.mp3\",\"you wanna do this the hard way.ogg\"},False,0\nSpeak,Wut,\"Oh you're welcome! I...wait what?\",,True,0\nSpeak,training,........,{\"morning warmup.mp3\",\"morning warmup.ogg\"},True,0\n", "baseurl": "ponies/rainbow%20dash/"},
                  {"ini": "Name,Rainbowshine\nCategories,\"supporting ponies\",mares,pegasi\nBehavior,stand,0.6,20,15,0,rainbowshine_idle_right.gif,rainbowshine_idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.5,20,15,2,rainbowshine_trot_right.gif,rainbowshine_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,fly,0.5,20,15,3,rainbowshine_flight_right.gif,rainbowshine_flight_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/rainbowshine/"},
                  {"ini": "Name,Raindrops\nCategories,\"supporting ponies\",mares,pegasi\nBehavior,stand,0.6,15,7,0,raindrops_standright.gif,raindrops_standleft.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,hover,0.2,15,7,2,raindrops_hoverright.gif,raindrops_hoverleft.gif,Vertical_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.2,20,7,3,raindrops_walkrights.gif,raindrops_walklefts.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,fly,0.2,20,7,2,raindrops_flyright.gif,raindrops_flyleft.gif,All,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,follow,0.15,30,10,2,raindrops_walkrights.gif,raindrops_walklefts.gif,All,,hello,,False,84,17,\"Derpy Hooves\",True,,,\"0,0\",\"0,0\",False,0,Mirror\nBehavior,sleep,0.02,60,60,0,raindrops_sleepright.gif,raindrops_sleepleft.gif,Sleep,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,gala,0.01,20,15,0,raindrops_galaright.png,raindrops_galaleft.png,None,,,,False,0,0,,True,,,\"47,38\",\"46,38\",False,0,Fixed\nSpeak,Where,\"Where are you, Derpy?\",,False,0\nSpeak,Hello,\"Hello, Derpy!\",,True,0\n", "baseurl": "ponies/raindrops/"},
                  {"ini": "Name,\"Rarity (Filly)\"\nCategories,\"main ponies\",fillies,unicorns\nBehavior,stand,0.2,15,3,0,rarityfilly_stand_right.gif,rarityfilly_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"41,34\",\"44,34\",False,0,Fixed\nBehavior,sleep,0,60,30,0,rarityfilly_sleep_right.gif,rarityfilly_sleep_left.gif,Sleep,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.25,15,3,2,rarityfilly_walk_right.gif,rarityfilly_walk_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"34,40\",\"41,40\",False,0,Fixed\nBehavior,walk_diagonal,0.2,15,3,1,rarityfilly_walk_right.gif,rarityfilly_walk_left.gif,Diagonal_Only,,,,False,0,0,,True,,,\"34,40\",\"41,40\",False,0,Fixed\nBehavior,horn_shine_false,0.15,7,6,0,rarityfilly_shine_right.gif,rarityfilly_shine_left.gif,None,,hm,,False,0,0,,True,,,\"43,52\",\"56,52\",False,0,Fixed\nBehavior,horn_shine_true,0.1,4,4,0,rarityfilly_shine_right.gif,rarityfilly_shine_left.gif,None,pull,hm,,False,0,0,,True,,,\"43,52\",\"56,52\",False,0,Fixed\nBehavior,pull,0,1,1,3,rarityfilly_pull_right.gif,rarityfilly_pull_left.gif,Diagonal_horizontal,pull_2,gah,,False,0,0,,True,,,\"37,40\",\"48,40\",False,0,Fixed\nBehavior,pull_2,0,5,3,3,rarityfilly_pull2_right.gif,rarityfilly_pull2_left.gif,Diagonal_horizontal,drag_1,what,,False,0,0,,True,,,\"35,36\",\"48,36\",False,0,Fixed\nBehavior,drag_1,0,10,5,3,rarityfilly_drag_right.gif,rarityfilly_drag_left.gif,Diagonal_horizontal,drag_2,,,False,0,0,,True,,,\"35,34\",\"50,34\",False,0,Fixed\nBehavior,drag_2,0,10,5,3,rarityfilly_drag_right.gif,rarityfilly_drag_left.gif,Diagonal_horizontal,drag_3,,,False,0,0,,True,,,\"35,34\",\"50,34\",False,0,Fixed\nBehavior,drag_3,0,10,5,3,rarityfilly_drag_right.gif,rarityfilly_drag_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"35,34\",\"50,34\",False,0,Fixed\nEffect,shine,horn_shine_false,hornshine_right.gif,hornshine_left.gif,1.2,0,Top_Right,Center,Top_Left,Center,True,False\nEffect,shine_2,horn_shine_true,hornshine_right.gif,hornshine_left.gif,1.2,0,Top_Right,Center,Top_Left,Center,True,False\nSpeak,hm,Hm?,,True,0\nSpeak,gah,Gah!,,True,0\nSpeak,what,\"What's going on?!\",,True,0\nSpeak,need_to_be,\"Nice?! They need to be spectacular!\",,False,0\nSpeak,fashionista,\"I'm going to become a great fashionista!\",,False,0\nSpeak,\"Soundboard #5\",\"Dumb rock!\",{\"dumb rock.mp3\",\"dumb rock.ogg\"},False,0\n", "baseurl": "ponies/rarity%20%28filly%29/"},
                  {"ini": "Name,Rarity\nCategories,\"main ponies\",mares,unicorns\nbehaviorgroup,1,Normal\nbehaviorgroup,2,Farmpony\nBehavior,stand,0.3,14.24,14.24,0,stand_rarity_right.gif,stand_rarity_left.gif,MouseOver,,,,False,0,0,,True,,,\"50,40\",\"47,40\",False,1,Fixed\nBehavior,walk,0.5,20,5,3,trotcycle_rarity_right.gif,trotcycle_rarity_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"50,42\",\"47,42\",False,1,Fixed\nBehavior,fly0,0.3,1.5,1.5,2,horn_right.gif,horn_left.gif,None,fly1,,,False,0,0,,True,,,\"50,40\",\"47,40\",False,1,Fixed\nBehavior,fly1,0,20,5,2,fly_right.gif,fly_left.gif,Diagonal_Vertical,,,,True,0,0,,True,,,\"50,70\",\"47,70\",False,1,Fixed\nBehavior,\"theme 1\",0,14.5,14.5,3,trotcycle_rarity_right.gif,trotcycle_rarity_left.gif,Diagonal_horizontal,,,\"theme 1\",True,0,0,,True,,,\"50,44\",\"47,42\",False,1,Fixed\nBehavior,Admire_Rarity_start,0.15,14.24,14.24,0,stand_rarity_right.gif,stand_rarity_left.gif,None,Admire_Rarity,,,False,0,0,,True,,,\"50,40\",\"47,40\",False,1,Fixed\nBehavior,Admire_Rarity,0.6,14.24,14.24,0,stand_rarity_right.gif,stand_rarity_left.gif,None,,,,True,0,0,,True,,,\"50,40\",\"47,40\",False,1,Fixed\nBehavior,Follow_Rarity,1,20,5,3,trotcycle_rarity_right.gif,trotcycle_rarity_left.gif,Horizontal_Only,,,,True,0,0,,True,,,\"50,44\",\"47,42\",False,1,Fixed\nBehavior,Galla_Dress,0.25,16.84,16.84,0,rarity_galla_right.gif,rarity_galla_left.gif,None,,dress,,False,0,0,,True,,,\"90,44\",\"47,44\",False,1,Fixed\nBehavior,ponder,0.2,12.68,12.68,0,ponder_right.gif,ponder_left.gif,None,,,,False,0,0,,True,,,\"52,42\",\"47,42\",False,1,Fixed\nBehavior,\"Drama Couch\",0.15,8.23,8.23,0,rarity_dramacouch_right1.gif,rarity_dramacouch_left1.gif,None,,\"Soundboard #10\",,False,0,0,,True,,,\"216,116\",\"383,108\",False,1,Fixed\nBehavior,Rarara,0,14.24,14.24,0,stand_rarity_right.gif,stand_rarity_left.gif,None,\"Fashion Show\",,,True,0,0,,True,,,\"50,40\",\"47,40\",False,1,Fixed\nBehavior,Tantrum,0.15,12.84,12.84,0,rarity_tantrum_right.gif,rarity_tantrum_left.gif,None,,whining,,False,0,0,,True,,,\"50,38\",\"51,38\",False,1,Fixed\nBehavior,\"Sleep 1\",0.25,42,18,0,sleep_right.gif,sleep_left.gif,None,,,,False,0,0,,True,,,\"33,24\",\"48,24\",False,1,Fixed\nBehavior,\"Sleep 2\",0.05,42,18,0,sleep_right_cover.gif,sleep_left_cover.gif,Sleep,,,,False,0,0,,True,,,\"33,24\",\"48,24\",False,1,Fixed\nBehavior,\"Fashion Show\",0.05,24.92,24.92,0,fashion_show_right.gif,fashion_show_left.gif,None,,,,False,0,0,,False,,,\"80,68\",\"93,68\",True,1,Fixed\nBehavior,\"Conga Start\",0,5,5,10,trotcycle_rarity_right.gif,trotcycle_rarity_left.gif,Diagonal_horizontal,Conga,,,True,80,40,\"Pinkie Pie\",False,stand,walk,\"50,44\",\"47,42\",False,1,Fixed\nBehavior,Conga,0,30,30,1.2,congararity_right.gif,congararity_left.gif,Horizontal_Only,,,,True,-43,1,\"Pinkie Pie\",False,stand,Conga,\"49,48\",\"48,48\",False,1,Mirror\nBehavior,drag,0.2,15,10,0,rarity_drag-right.gif,rarity_drag-left.gif,Dragged,,,,True,0,0,,True,,,\"53,37\",\"42,37\",False,1,Fixed\nBehavior,crystallized,0.01,30,15,0,crystal-rarity-right.gif,crystal-rarity-left.gif,None,,,,False,0,0,,False,,,\"56,44\",\"47,44\",False,1,Fixed\nBehavior,Farmpony_start,0.05,15,5,3,trotcycle_rarity_right.gif,trotcycle_rarity_left.gif,Diagonal_horizontal,farm_stand,,,False,0,0,,True,,,\"50,42\",\"47,42\",False,1,Fixed\nBehavior,Farmpony_start2,0.15,3,1,0,stand_rarity_right.gif,stand_rarity_left.gif,None,farm_stand,,,False,0,0,Trenderhoof,False,stand,stand,\"50,40\",\"47,40\",False,1,Fixed\nBehavior,farm_stand,0.2,15,10,0,rarity-c-idle-right.gif,rarity-c-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"55,52\",\"50,52\",False,2,Fixed\nBehavior,farm_stand1,0.03,15,3,0,rarity-c-idle-right.gif,rarity-c-idle-left.gif,None,,,,False,0,0,,True,,,\"55,52\",\"50,52\",False,2,Fixed\nBehavior,farm_stand2,0.03,15,3,0,rarity-c-idle-right.gif,rarity-c-idle-left.gif,None,,,,False,0,0,,True,,,\"55,52\",\"50,52\",False,2,Fixed\nBehavior,farm_walk,0.3,15,7,2.5,rarity-c-trot-right.gif,rarity-c-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"57,54\",\"52,56\",False,2,Fixed\nBehavior,farm_walk1,0.03,15,2,2.5,rarity-c-trot-right.gif,rarity-c-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"57,56\",\"52,56\",False,2,Fixed\nBehavior,farm_walk2,0.03,15,2,2.5,rarity-c-trot-right.gif,rarity-c-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"57,56\",\"52,56\",False,2,Fixed\nBehavior,farm_scratch,0.2,3,3,0,rarity-c-scratch-right.gif,rarity-c-scratch-left.gif,None,,,,False,0,0,,True,,,\"51,46\",\"60,46\",False,2,Fixed\nBehavior,Farmpony_end,0.15,15,7,2.5,rarity-c-trot-right.gif,rarity-c-trot-left.gif,Diagonal_horizontal,stand,,,False,0,0,,True,,,\"57,56\",\"52,56\",False,2,Fixed\nBehavior,farm_drag,0.2,15,10,0,rarity-c-drag-right.gif,rarity-c-drag-left.gif,Dragged,,,,True,0,0,,True,,,\"49,51\",\"40,51\",False,2,Fixed\nEffect,fly1-idle,farm_stand1,fly1-right.gif,fly1-left.gif,1.68,1.68,Bottom,Bottom,Bottom,Bottom,True,True\nEffect,fly2-idle,farm_stand2,fly2-right.gif,fly2-left.gif,1.92,1.92,Bottom,Bottom,Bottom,Bottom,True,True\nEffect,fly1-walk,farm_walk1,fly1-right.gif,fly1-left.gif,1.68,1.68,Bottom,Bottom,Bottom,Bottom,True,True\nEffect,fly2-walk,farm_walk2,fly2-right.gif,fly2-left.gif,1.92,1.92,Bottom,Bottom,Bottom,Bottom,True,True\nEffect,crystalspark,crystallized,sparkle.gif,sparkle.gif,0,0,Center,Center,Center,Center,True,False\nSpeak,\"Unnamed #1\",\"Marvelous, darling!\",,False,1\nSpeak,\"Unnamed #3\",\"Watch the mane, please.\",,False,1\nSpeak,\"Unnamed #4\",\"Thread by thread, stitching it together~\",,False,1\nSpeak,\"Theme 1\",\"A beautiful heart!\",,True,1\nSpeak,dress,\"Stay back, and my dress doesn't get hurt!\",,True,1\nSpeak,\"Soundboard #1\",\"Afraid to get dirty?\",{\"afraid to get dirty.mp3\",\"afraid to get dirty.ogg\"},False,1\nSpeak,Whining,\"But I thought you wanted whining?\",{\"but i thought you wanted whining.mp3\",\"but i thought you wanted whining.ogg\"},True,1\nSpeak,\"Soundboard #3\",\"I simply cannot let such a crime against fabulosity go uncorrected!\",{\"crime against fabulosity.mp3\",\"crime against fabulosity.ogg\"},False,1\nSpeak,\"Soundboard #4\",\"Doesn't even make sense.\",{\"doesn't even make sense.mp3\",\"doesn't even make sense.ogg\"},False,1\nSpeak,\"Soundboard #6\",\"Gently, please!\",{\"gently please.mp3\",\"gently please.ogg\"},False,1\nSpeak,\"Soundboard #7\",\"How can you be so insensitive?\",{\"how can you be so insensitive.mp3\",\"how can you be so insensitive.ogg\"},False,1\nSpeak,\"Soundboard #8\",\"How could you?\",{\"how could you.mp3\",\"how could you.ogg\"},False,1\nSpeak,\"Soundboard #9\",Ideaaaaa!,{idea.mp3,idea.ogg},False,1\nSpeak,\"Soundboard #10\",\"I'm so pathetic!\",{\"i'm so pathetic.mp3\",\"i'm so pathetic.ogg\"},True,1\nSpeak,\"Soundboard #11\",\"Oh, it is ON!\",{\"it is on.mp3\",\"it is on.ogg\"},False,1\nSpeak,\"Soundboard #12\",\"Leave me alone!\",{\"leave me alone.mp3\",\"leave me alone.ogg\"},False,1\nSpeak,\"Soundboard #13\",\"Mama's coming!\",{\"mama's coming.mp3\",\"mama's coming.ogg\"},False,1\nSpeak,\"Soundboard #14\",Oooooooooooooooo!,{oooooooooooooooo.mp3,oooooooooooooooo.ogg},False,1\nSpeak,\"Soundboard #15\",\"Please, please, pleeeeeeeease!\",{please.mp3,please.ogg},False,1\nSpeak,\"Soundboard #16\",\"My hooves are getting positively pruney, I've been waiting here so long.\",{\"pruney hooves.mp3\",\"pruney hooves.ogg\"},False,1\nSpeak,\"Soundboard #17\",\"Some of us DO have standards!\",{\"some of us do have standards.mp3\",\"some of us do have standards.ogg\"},False,1\nSpeak,\"Soundboard #18\",\"Take that you ruffian!\",{\"take that you ruffian.mp3\",\"take that you ruffian.ogg\"},False,1\nSpeak,\"Soundboard #19\",\"Tell me, tell me, tell me, tell me, tell me!\",{\"tell me.mp3\",\"tell me.ogg\"},False,1\nSpeak,\"Soundboard #20\",\"Oh, thank you, thank you, thank you, thank you!\",{\"thank you.mp3\",\"thank you.ogg\"},False,1\nSpeak,\"Soundboard #21\",\"I can't wait to hear all about the... thing at the place.\",{\"thing at the place.mp3\",\"thing at the place.ogg\"},False,1\nSpeak,\"Soundboard #22\",\"This is whining!\",{\"this is whining.mp3\",\"this is whining.ogg\"},False,1\nSpeak,\"Soundboard #23\",\"Try it, punk!\",{\"try it punk.mp3\",\"try it punk.ogg\"},False,1\nSpeak,\"Soundboard #24\",Wahahaha!,{wahahaha.mp3,wahahaha.ogg},False,1\nSpeak,\"Soundboard #25\",\"What ever shall we do?\",{\"what ever shall we do.mp3\",\"what ever shall we do.ogg\"},False,1\nSpeak,\"Soundboard #26\",\"You look smashing!\",{\"you look smashing.mp3\",\"you look smashing.ogg\"},False,1\nSpeak,\"Soundboard #27\",\"You must. You must, you must!\",{\"you must.mp3\",\"you must.ogg\"},False,1\nSpeak,\"Soundboard #28\",\"You're just saying that!\",{\"you're just saying that.mp3\",\"you're just saying that.ogg\"},False,1\nSpeak,\"Farm 1\",Fun-nay?,,False,2\nSpeak,\"Farm 2\",\"I have a hootenanny of a festival to put on.\",,False,2\nSpeak,\"Farm 3\",\"If you want to be real simple, more is more.\",,False,2\nSpeak,\"Farm 4\",\"Well, my mane is full of dust and split ends.\",,False,2\nSpeak,\"Farm 5\",\"My hooves are cracked and dry from working in the fields!\",,False,2\nSpeak,\"Farm 6\",\"I wear droopy drawers!\",,False,2\nSpeak,\"Farm 7\",\"I love being covered in mud!!!\",,False,2\n", "baseurl": "ponies/rarity/"},
                  {"ini": "Name,\"Rarity's Father\"\nCategories,\"supporting ponies\",stallions,unicorns\nBehavior,stand,0.25,18,10,0,r_dad_idle_right.gif,r_dad_idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.25,10,8,2.8,raritys_dad_right.gif,raritys_dad_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/rarity%27s%20father/"},
                  {"ini": "Name,\"Rarity's Mother\"\nCategories,\"supporting ponies\",mares,unicorns\nBehavior,stand,0.25,18,10,0,r_mom_idle_right.gif,r_mom_idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.25,10,8,2.8,raritysmom_trot_right.gif,raritysmom_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/rarity%27s%20mother/"},
                  {"ini": "Name,Raven\nCategories,\"supporting ponies\",mares,unicorns\nBehavior,stand,0.1,15,10,0,raven-idle-right.gif,raven-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"37,54\",\"34,54\",False,0\nBehavior,walk,0.25,15,5,3,raven-trot-right.gif,raven-trot-left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"37,58\",\"32,58\",False,0\nBehavior,fly,0.15,10,5,3,raven-trot-right.gif,raven-trot-left.gif,Diagonal_Only,,,,False,0,0,,True,,,\"37,58\",\"32,58\",False,0\nBehavior,follow,0.05,50,20,3,raven-trot-right.gif,raven-trot-left.gif,All,,,,False,-8,30,\"Princess Celestia\",True,,,\"37,58\",\"32,58\",False,0\n", "baseurl": "ponies/raven/"},
                  {"ini": "Name,Roseluck\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.5,20,15,0,rose_stand_right.gif,rose_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,Trot,0.5,20,15,3,rose_trot_right.gif,rose_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Soundboard #1\",\"The horror, the horror!\",{\"the horror.mp3\",\"the horror.ogg\"},False,0\nSpeak,\"Soundboard #2\",\"The wicked enchantress has cursed them all!\",{\"the wicked enchantress has cursed them all.mp3\",\"the wicked enchantress has cursed them all.ogg\"},False,0\n", "baseurl": "ponies/roseluck/"},
                  {"ini": "Name,Rover\nCategories,non-ponies,\"supporting ponies\",stallions\nBehavior,idle,0.25,8,5,0,rover_idle_right.gif,rover_idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"53,50\",\"0,0\",False,0,Fixed\nBehavior,walk,0.25,8,6,2.15,rover_walk_right.gif,rover_walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"50,48\",\"49,48\",False,0,Fixed\nBehavior,threat,0.25,8,6,1.5,rover_threatning_right.gif,rover_threatning_left.gif,All,,,,True,0,0,Rarity,False,idle,threat,\"54,40\",\"53,40\",False,0,Fixed\nBehavior,cover,0.05,2,2,0,rover_hurt_right.gif,rover_hurt_left.gif,None,covering,,,False,0,0,,True,,,\"53,68\",\"84,68\",False,0,Fixed\nBehavior,covering,0,4,2,0,rover_hurting_right.gif,rover_hurting_left.gif,None,,,,True,0,0,,True,,,\"31,-2\",\"80,-2\",False,0,Fixed\nBehavior,laugh,0.15,2,1,0,rover_pokpok_right.gif,rover_pokpok_left.gif,None,,,,False,0,0,,True,,,\"45,52\",\"44,52\",False,0,Fixed\n", "baseurl": "ponies/rover/"},
                  {"ini": "Name,\"Royal Guard\"\nCategories,stallions,pegasi,\"supporting ponies\"\nBehavior,stand,0.1,15,10,0,royalguard_stand_right.gif,royalguard_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,fly,0.15,10,5,3,royalguard_fly_right.gif,royalguard_fly_left.gif,Diagonal_Vertical,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.25,15,5,3,royalguard_trot_right.gif,royalguard_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Unnamed #1\",\"Who goes there?\",,False,0\nSpeak,\"Unnamed #2\",Halt!,,False,0\n", "baseurl": "ponies/royal%20guard/"},
                  {"ini": "Name,\"Royal Night Guard\"\nCategories,stallions,pegasi,\"supporting ponies\"\nBehavior,stand,0.1,15,10,0,nightguard_right.gif,nightguard_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.25,15,5,3,nightguard_trot_right.gif,nightguard_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,fly,0.15,10,5,5,nightguard_fly_right.gif,nightguard_fly_left.gif,All,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,escort,0.25,20,6,2.5,nightguard_trot_right.gif,nightguard_trot_left.gif,All,,,,False,-12,30,\"Princess Luna\",True,,,\"0,0\",\"0,0\",False,0,Mirror\nSpeak,\"Unnamed #1\",\"Who goes there?\",,False,0\nSpeak,\"Unnamed #2\",Halt!,,False,0\n", "baseurl": "ponies/royal%20night%20guard/"},
                  {"ini": "Name,\"Ruby Pinch\"\nCategories,fillies,unicorns,\"supporting ponies\"\nBehavior,stand,0.1,15,10,0,ruby_idle_right.gif,ruby_idle_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.25,15,5,2,ruby_trot_r.gif,ruby_trot_l.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,follow_mom1,0.2,30,10,4,ruby_trot_r.gif,ruby_trot_l.gif,All,,,,False,0,0,\"Berry Punch\",True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,follow_mom2,0.2,30,10,4,ruby_trot_r.gif,ruby_trot_l.gif,All,,,,False,0,0,\"Berry Punch\",True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,sit,0.1,30,25,0,ruby_sit_right.gif,ruby_sit_left.gif,None,,,,False,0,0,,True,,,\"35,18\",\"34,18\",False,0,Fixed\nBehavior,sleep,0.1,30,15,0,ruby_sleep_right.gif,ruby_sleep_left.gif,Sleep,,,,False,0,0,,True,,,\"35,18\",\"34,18\",False,0,Fixed\nSpeak,Yay!,Yay!,,False,0\nSpeak,Hugs?,Hugs?,,False,0\nSpeak,Wat.,Wat.,,False,0\n", "baseurl": "ponies/ruby%20pinch/"},
                  {"ini": "Name,Rumble\nCategories,\"supporting ponies\",colts,pegasi\nBehavior,stand,0.2,20,15,0,rumble_stand_right.gif,rumble_stand_left.gif,MouseOver,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.4,26,15,2.5,rumble_trot_right.gif,rumble_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,follow,0.15,30,20,3.5,rumble_trot_right.gif,rumble_trot_left.gif,All,,bro!,bye,False,-35,0,Thunderlane,False,stand,trot,\"0,0\",\"0,0\",False,0\nBehavior,sit,0.2,20,15,0,rumble_sit_right.gif,rumble_sit_left.gif,None,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,sleep,0.17,47,36,0,rumble_sleep_right.gif,rumble_sleep_left.gif,Sleep,sit,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nSpeak,Bro!,\"Big bro! Wait up!\",,True,0\nSpeak,bye,\"See ya later bro!\",,True,0\nSpeak,\"feather flu\",\"He's got the feather flu. He's down at Ponyville Hospital.\",{\"feather flu.mp3\",\"feather flu.ogg\"},False,0\n", "baseurl": "ponies/rumble/"},
                  {"ini": "Name,\"Sapphire Shores\"\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.25,4.4,3,0,sapphire_idle_right.gif,sapphire_idlesize.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.1,15,6,3.4,sapphire_trot_right.gif,sapphire_trotsize.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,sensational,0.25,3,3,0,sensational_right.gif,sensational_left.gif,None,stand,sing,,False,0,0,,True,,,\"42,56\",\"53,56\",False,0,Fixed\nSpeak,sing,Sensational!,,True,0\n", "baseurl": "ponies/sapphire%20shores/"},
                  {"ini": "Name,Scootaloo\nCategories,\"supporting ponies\",fillies,pegasi\nBehavior,stand,0.1,15,10,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk2,0.15,10,5,2,walk_right.gif,walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.25,15,5,2,walk_right.gif,walk_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,gallop,0.15,15,8,4.5,scootaloo-gallop-right.gif,scootaloo-gallop-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,fly,0.15,5,3,1,scootaloo-fly-right.gif,scootaloo-fly-left.gif,Diagonal_Vertical,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,scoot_c,0,10,5,3,scoot_right.gif,scoot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,scoot,0.2,15,10,4,scoot_right.gif,scoot_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,basket,0.1,15,10,0,basket_right.gif,basket_left.gif,Sleep,,Basket,,False,0,0,,True,,,\"26,62\",\"39,62\",False,0,Fixed\nBehavior,follow_dash,0.08,60,40,3,walk_right.gif,walk_left.gif,All,,Dash,,False,-8,16,\"Rainbow Dash\",False,stand,walk2,\"0,0\",\"0,0\",False,0,Mirror\nBehavior,CMC,0,15,15,5,walk_right.gif,walk_left.gif,All,,cmc,,True,-40,-10,\"Apple Bloom\",True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,Skip,0.15,14,7,4,scootaloo_skipright.gif,scootaloo_skipleft.gif,Horizontal_Only,,,,False,0,0,,True,,,\"53,68\",\"52,68\",False,0,Fixed\nSpeak,Dash,\"Dash! Dash! Over here, Dash!\",,True,0\nSpeak,Basket,\"I'm being adorable and no one can stop me!\",,True,0\nSpeak,Cannon,\"Do you know where we can find a cannon at this hour?\",,False,0\nSpeak,Mark,\"I'm going to get my mark first!\",,False,0\nSpeak,Table,\"We were making a table?\",,False,0\nSpeak,CMC,\"CUTIE MARK CRUSADER DESKTOP PONIES!!!\",,True,0\nSpeak,\"Soundboard #1\",\"The possibilities are, like, endless!\",{\"endless possibilities.mp3\",\"endless possibilities.ogg\"},False,0\nSpeak,\"Soundboard #2\",Ewwww!,{ewwww.mp3,ewwww.ogg},False,0\nSpeak,\"Soundboard #3\",\"I'll do whatever you want, Rainbow Dash!\",{\"i'll do whatever you want rainbow dash.mp3\",\"i'll do whatever you want rainbow dash.ogg\"},False,0\nSpeak,\"Soundboard #4\",\"I'm liking this idea.\",{\"i'm liking this idea.mp3\",\"i'm liking this idea.ogg\"},False,0\nSpeak,\"Soundboard #5\",\"These namby-pamby stories aren't going to take us any closer to our cutie marks.\",{\"namby pamby stories.mp3\",\"namby pamby stories.ogg\"},False,0\nSpeak,\"Soundboard #6\",\"Never, never, never!\",{never.mp3,never.ogg},False,0\nSpeak,\"Soundboard #7\",\"You've got a problem with blank flanks?\",{\"proplem with blank flanks.mp3\",\"proplem with blank flanks.ogg\"},False,0\nSpeak,\"Soundboard #8\",\"That is not how you call a chicken.\",{\"that is not how you call a chicken.mp3\",\"that is not how you call a chicken.ogg\"},False,0\nSpeak,\"Soundboard #9\",\"That's so funny I forgot to laugh.\",{\"that's so funny i forgot to laugh.mp3\",\"that's so funny i forgot to laugh.ogg\"},False,0\nSpeak,\"Soundboard #10\",\"TLC as in Tender Loving Care or Totally Lost Cause?\",{tlc.mp3,tlc.ogg},False,0\nSpeak,\"Soundboard #11\",Wha...huh?,{wha...huh.mp3,wha...huh.ogg},False,0\n", "baseurl": "ponies/scootaloo/"},
                  {"ini": "Name,Screwball\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,float,1,60,60,2,screwball_right.gif,screwball_left.gif,All,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/screwball/"},
                  {"ini": "Name,\"Screw Loose\"\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.5,15,8,0,screwloose-idle-right.gif,screwloose-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"45,44\",\"47,44\",False,0\nBehavior,walk,0.5,15,7,3,screwloose-trot-right.gif,screwloose-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"45,46\",\"47,46\",False,0\nBehavior,bark,0.05,5,2,0,screwloose-bark-right.gif,screwloose-bark-left.gif,None,,\"speech 1\",,False,0,0,,True,,,\"45,50\",\"47,50\",False,0\nSpeak,\"Speech 1\",*bark*,,False,1\nSpeak,\"Speech 2\",\"Bark bark... just kidding. ;)\",,False,0\n", "baseurl": "ponies/screw%20loose/"},
                  {"ini": "Name,Seabreeze\nCategories,stallion,non-ponies,breezies\nBehavior,stand,0.2,7,3,0,seabreeze2-right.gif,seabreeze2-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,hover,0.5,15,3,0.1,seabreeze2-right.gif,seabreeze2-left.gif,Diagonal_Vertical,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,hover2,0.5,15,3,0.2,seabreeze2-right.gif,seabreeze2-left.gif,Diagonal_Vertical,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,fly,0.4,10,3,0.5,seabreeze-right.gif,seabreeze-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,fly2,0.4,7,3,0.7,seabreeze-right.gif,seabreeze-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,follow_fluttershy,0.1,40,10,0.4,seabreeze-right.gif,seabreeze-left.gif,Diagonal_horizontal,,,,False,-10,-23,Fluttershy,True,,,\"0,0\",\"0,0\",False,0,Mirror\nSpeak,\"Speech 1\",\"Nobreezie ever listens to me!\",,False,0\nSpeak,\"Speech 2\",\"Well, this desktop doesn't look too dangerous...\",,False,0\nSpeak,\"Speech 3\",\"I believe in you.\",,False,0\nSpeak,\"Speech 4\",\"I was only trying to do my job.\",,False,0\n", "baseurl": "ponies/seabreeze/"},
                  {"ini": "Name,\"Sea Swirl\"\nCategories,\"supporting ponies\",mares,unicorns\nBehavior,stand,0.4,15,3,0,seaswirl_stand_right.gif,seaswirl_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"48,42\",\"0,0\",False,0,Fixed\nBehavior,trot,0.4,15,3,2,seaswirl_trot_right.gif,seaswirl_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,horn0,0.3,1.2,1.2,0,seaswirl_horn0_right.gif,seaswirl_horn0_left.gif,None,horn1,,,False,0,0,,True,,,\"48,42\",\"51,42\",False,0,Fixed\nBehavior,horn1,0,20,5,0,seaswirl_horn1_right.gif,seaswirl_horn1_left.gif,None,horn2,,,True,0,0,,True,,,\"48,36\",\"51,36\",False,0,Fixed\nBehavior,horn2,0,1.2,1.2,0,seaswirl_horn2_right.gif,seaswirl_horn2_left.gif,None,,,,True,0,0,,True,,,\"48,42\",\"51,42\",False,0,Fixed\nBehavior,sitting,0.2,45,30,0,seaswirl_sit_right.gif,seaswirl_sit_left.gif,Sleep,,,,False,0,0,,True,,,\"46,24\",\"45,24\",False,0,Fixed\nBehavior,stretch,0.2,4,2,0,seaswirl_stretch_right.gif,seaswirl_stretch_left.gif,None,,,,False,0,0,,True,,,\"52,26\",\"51,26\",False,0,Fixed\nBehavior,nmn-stand,0.3,15,3,0,nmn_ss_stand_right.gif,nmn_ss_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"43,62\",\"42,62\",False,0,Fixed\nBehavior,nmn-trot,0.3,15,3,2,nmn_ss_trot_right.gif,nmn_ss_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"44,70\",\"43,70\",False,0,Fixed\nBehavior,nmn-open,0.2,2,2,0,nmn_ss_open_right.gif,nmn_ss_open_left.gif,None,nmn-stand2,,,False,0,0,,True,,,\"43,62\",\"44,62\",False,0,Fixed\nBehavior,nmn-stand2,0,20,5,0,nmn_ss_stand2_right.gif,nmn_ss_stand2_left.gif,None,nmn-close,,,True,0,0,,True,,,\"43,62\",\"44,62\",False,0,Fixed\nBehavior,nmn-close,0,2,2,0,nmn_ss_close_right.gif,nmn_ss_close_left.gif,None,,,,True,0,0,,True,,,\"43,62\",\"52,62\",False,0,Fixed\nBehavior,nmn-open2,0.2,2,2,0,nmn_ss_open_right.gif,nmn_ss_open_left.gif,None,nmn-scared,,,False,0,0,,True,,,\"43,62\",\"44,62\",False,0,Fixed\nBehavior,nmn-scared,0,10,5,0,nmn_ss_scared_right.gif,nmn_ss_scared_left.gif,None,nmn-close2,,,True,0,0,,True,,,\"43,62\",\"44,62\",False,0,Fixed\nBehavior,nmn-close2,0,2,2,0,nmn_ss_close2_right.gif,nmn_ss_close2_left.gif,None,,,,True,0,0,,True,,,\"43,62\",\"50,62\",False,0,Fixed\nSpeak,\"Unnamed #1\",\"Cool! A bowling cutie mark!\",,False,0\n", "baseurl": "ponies/sea%20swirl/"},
                  {"ini": "Name,Shadowbolt\nCategories,\"supporting ponies\",pegasi,mares\nBehavior,stand,0.2,5,3.5,0,shadowbolt_stand_right.gif,shadowbolt_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,run,0.2,10,5,5,shadowbolt_run_right.gif,shadowbolt_run_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,fly,0.2,10,5,4,shadowbolt_fly_right.gif,shadowbolt_fly_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,join,0.5,10,5,3,shadowbolt_run_right.gif,shadowbolt_run_left.gif,All,,join,us,False,0,0,\"Rainbow Dash\",True,,,\"0,0\",\"0,0\",False,0\nSpeak,join,\"We want you to join us... the Shadowbolts!\",,False,0\nSpeak,greatest,\"We're the greatest aerial team in the Everfree Forest!\",,False,0\nSpeak,us,\"It's them... or us!\",,False,0\n", "baseurl": "ponies/shadowbolt/"},
                  {"ini": "Name,\"Sheriff Silverstar\"\nCategories,\"supporting ponies\",stallions,\"earth ponies\"\nBehavior,stand,0.5,30,20,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.5,20,15,2,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/sheriff%20silverstar/"},
                  {"ini": "Name,\"Shining Armor\"\nCategories,\"supporting ponies\",unicorns,stallions\nBehavior,stand,0.25,8,6,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.25,8,6,1,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/shining%20armor/"},
                  {"ini": "Name,Shoeshine\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.2,8,6,0,shoeshine-idle-right.gif,shoeshine-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"45,36\",\"43,36\",False,0,Fixed\nBehavior,trot,0.25,8,6,3,shoeshine-trot-right.gif,shoeshine-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"43,38\",\"43,38\",False,0,Fixed\nBehavior,dance,0.06,3.1,3.1,0,shoeshine-dance-right.gif,shoeshine-dance-left.gif,None,,,,False,0,0,,True,,,\"68,58\",\"68,58\",False,0,Fixed\nBehavior,follow_carrottop,0.05,12,6,3,shoeshine-trot-right.gif,shoeshine-trot-left.gif,Diagonal_horizontal,,,,False,8,32,\"Carrot Top\",True,,,\"43,38\",\"43,38\",False,0,Fixed\nBehavior,drag,0.25,8,6,0,shoeshine-drag-right.gif,shoeshine-drag-left.gif,Dragged,,,,True,0,0,,True,,,\"46,50\",\"18,50\",False,0,Fixed\nBehavior,lyrashine,0.25,3,2.5,3,shoeshine-trot-right.gif,shoeshine-trot-left.gif,Diagonal_horizontal,bench-duo,,,True,0,4,Lyra,False,stand,trot,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,bench-duo,0.25,32,25,0,benchshoeshine.gif,benchshoeshine.gif,None,bench-end,,,True,0,0,,True,,,\"64,52\",\"64,52\",False,0,Fixed\nBehavior,bench-end,0.3,15,5,3,shoeshine-trot-right.gif,shoeshine-trot-left.gif,Diagonal_horizontal,,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nSpeak,\"Speech 1\",\"I have a cartload of extra carrots.\",,False,0\nSpeak,\"Speech 2\",\"We get it! Move on!\",,False,0\n", "baseurl": "ponies/shoeshine/"},
                  {"ini": "Name,Shopkeeper\nCategories,stallions,\"earth ponies\",\"supporting ponies\"\nBehavior,stand,0.3,15,5,0,shopkeeper-idle-right.gif,shopkeeper-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"34,51\",\"34,51\",False,0\nBehavior,walk,0.4,15,7,2.4,shopkeeper-trot-right.gif,shopkeeper-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"38,51\",\"34,51\",False,0\nBehavior,talk,0.07,3.7,3.5,0,shopkeeper-deal-right.gif,shopkeeper-deal-left.gif,None,,\"speech 1\",,False,0,0,,True,,,\"34,51\",\"44,51\",False,0\nBehavior,deal_twi,0.05,3.7,3.5,0,shopkeeper-deal-right.gif,shopkeeper-deal-left.gif,None,,twi,,True,0,0,\"Twilight Sparkle\",True,,,\"34,51\",\"44,51\",False,0\nBehavior,deal_aj,0.05,3.7,3.5,0,shopkeeper-deal-right.gif,shopkeeper-deal-left.gif,None,,aj,,True,0,0,Applejack,True,,,\"34,51\",\"44,51\",False,0\nBehavior,deal_applebloom,0.05,3.7,3.5,0,shopkeeper-deal-right.gif,shopkeeper-deal-left.gif,None,,applebloom,,True,0,0,\"Apple Bloom\",True,,,\"34,51\",\"44,51\",False,0\nBehavior,deal_celestia,0.05,3.7,3.5,0,shopkeeper-deal-right.gif,shopkeeper-deal-left.gif,None,,celestia,,True,0,0,\"Princess Celestia\",True,,,\"34,51\",\"44,51\",False,0\nBehavior,deal_cadance,0.05,3.7,3.5,0,shopkeeper-deal-right.gif,shopkeeper-deal-left.gif,None,,cadance,,True,0,0,\"Princess Cadance\",True,,,\"34,51\",\"44,51\",False,0\nBehavior,deal_zecora,0.05,3.7,3.5,0,shopkeeper-deal-right.gif,shopkeeper-deal-left.gif,None,,zecora,,True,0,0,Zecora,True,,,\"34,51\",\"44,51\",False,0\nBehavior,deal_trixie,0.05,3.7,3.5,0,shopkeeper-deal-right.gif,shopkeeper-deal-left.gif,None,,trixie,,True,0,0,Trixie,True,,,\"34,51\",\"44,51\",False,0\nSpeak,\"Speech 1\",\"May I help you, traveler?\",{\"help traveller.mp3\",\"help traveller.ogg\"},True,0\nSpeak,\"Speech 2\",\"I'll make you a deal.\",,False,0\nSpeak,\"Speech 3\",\"Would you like that gift-wrapped?\",,False,0\nSpeak,twi,\"May I interest you in the Necroponycon? Surely a mare of vast reading like yourself knows a good bargain when she sees it.\",,True,0\nSpeak,aj,\"How about this magic lasso? Everypony bound by it will tell the truth!\",,True,0\nSpeak,applebloom,\"I'm sorry, but even I don't have cutie-marks in stock.\",,True,0\nSpeak,celestia,\"What? No, I'm not selling immensely powerful magical artifacts to just any random pony! Why would you think such a thing?\",,True,0\nSpeak,cadance,\"Hey, I'm giving you 10 bits for that Crystal Heart of yours. No?\",,True,0\nSpeak,zecora,\"I'm thinking about expanding my business with a few potions. Maybe we could make a deal?\",,True,0\nSpeak,trixie,\"You're not satisfied with the amulet? Sorry, no refunds.\",,True,0\n", "baseurl": "ponies/shopkeeper/"},
                  {"ini": "Name,Silverspeed\nCategories,\"supporting ponies\",mares,pegasi\nBehavior,stand,0.15,15,12,0,silverspeed_stand_right.gif,silverspeed_stand_left.gif,MouseOver,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,fly,0.3,25,19,5,silverspeed_fly_right.gif,silverspeed_fly_left.gif,All,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,\"stand wing\",0.2,20,15,0,silverspeed_stand_right_wing.gif,silverspeed_stand_left_wing.gif,None,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,\"trot wing blink\",0.25,27,19,3,silverspeed_trot_right_wing_blink.gif,silverspeed_trot_left_wing_blink.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,\"trot wing\",0.15,22,15,3,silverspeed_trot_right_wing.gif,silverspeed_trot_left_wing.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,hover,0.16,13,9,2,silverspeed_fly_right.gif,silverspeed_fly_left.gif,Vertical_Only,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,\"trot blink\",0.18,18,15,3,silverspeed_trot_right_blink.gif,silverspeed_trot_left_blink.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.17,18,14,3,silverspeed_trot_right.gif,silverspeed_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,sit,0.15,20,17,0,silverspeed_sit_right.gif,silverspeed_sit_left.gif,None,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,sleep,0.08,45,38,0,silverspeed_sleep_right.gif,silverspeed_sleep_left.gif,Sleep,sit,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,\"good pace\",0.1,15,15,5,silverspeed_good_pace_right.gif,silverspeed_good_pace_left.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0\nBehavior,training,0,17,17,4,silverspeed_good_pace_right.gif,silverspeed_good_pace_left.gif,Horizontal_Only,,,,True,0,0,,False,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/silverspeed/"},
                  {"ini": "Name,\"Silver Spoon\"\nCategories,\"supporting ponies\",fillies,\"earth ponies\"\nBehavior,stand,0.25,20,15,0,stand_right.gif,stand_left.gif,None,,,,False,0,0,,True,,,\"32,23\",\"33,23\",False,0,Fixed\nBehavior,trot,0.25,20,15,2,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"34,29\",\"33,29\",False,0,Fixed\nBehavior,scoff,0.1,7.5,7.5,0,scoff_right.gif,scoff_left.gif,MouseOver,,blank_flank,,False,0,0,,True,,,\"32,23\",\"33,23\",False,0,Fixed\nBehavior,bump_left,0,3,3,2,trot_right.gif,trot_left.gif,All,bump,,,True,-38,-2,\"Diamond Tiara\",True,bump,bump,\"34,29\",\"33,29\",True,0,Fixed\nBehavior,bump_right,0,3,3,2,trot_right.gif,trot_left.gif,All,bump,,,True,38,-2,\"Diamond Tiara\",True,bump,bump,\"34,29\",\"33,29\",True,0,Fixed\nBehavior,bump,0.15,2.5,2.5,0,blank.gif,blank.gif,None,,bump,,True,0,0,,True,,,\"1,1\",\"1,1\",True,0,Fixed\nSpeak,blank_flank,\"Blank Flank!\",,True,0\nSpeak,bump,\"Bump, bump, sugar-lump rump!\",,True,0\n", "baseurl": "ponies/silver%20spoon/"},
                  {"ini": "Name,Sindy\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.25,20,15,0,sindy_s_right.gif,sindy_s_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.25,20,12,3,sindy_2_right.gif,sindy_2_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,sleep,0.03,30,20,0,sindy_sl_right.gif,sindy_sl_left.gif,Sleep,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/sindy/"},
                  {"ini": "Name,\"Sir Colton Vines\"\nCategories,\"supporting ponies\",stallions,\"earth ponies\"\nBehavior,stand,0.33,20,15,0,colton_stand_right.gif,colton_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.33,20,15,2,colton_trot_right.gif,colton_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,blink,0.05,10.28,10.28,0,colton_blink_right.gif,colton_blink_left.gif,None,,,,False,0,0,Daisy,False,blink,trot,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/sir%20colton%20vines/"},
                  {"ini": "Name,Slendermane\nCategories,stallions,\"earth ponies\"\nBehavior,stand,0.4,15,6,0,slendermane-idle-right.gif,slendermane-idle-left.gif,None,,,,False,0,0,,True,,,\"33,42\",\"0,0\",False,0,Fixed\nBehavior,trot,0.5,12,5,2,slendermane-right.gif,slendermane-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"41,46\",\"32,46\",False,0,Fixed\nBehavior,glitch,0.01,1.7,0.7,0,slendermane-glitch-right.gif,slendermane-glitch-left.gif,None,,,,False,0,0,,True,,,\"41,42\",\"40,42\",False,0,Fixed\nBehavior,mouseover,0.5,10,5,0,slendermane-mouse-right.gif,slendermane-mouse-left.gif,MouseOver,,,,True,0,0,,True,,,\"33,42\",\"26,42\",False,0,Fixed\nBehavior,warp,0.015,0.8,0.4,13,glitchwarp.gif,glitchwarp.gif,All,glitch-in,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,glitch-in,0.4,3,2,0,slendermane-glitchin-right.gif,slendermane-glitchin-left.gif,None,,,,True,0,0,,True,,,\"47,42\",\"42,42\",False,0,Fixed\nEffect,glitch-out,warp,slendermane-glitchout-right.gif,slendermane-glitchout-left.gif,4,0,Center,Center,Center,Center,False,True\n", "baseurl": "ponies/slendermane/"},
                  {"ini": "Name,Snails\nCategories,\"supporting ponies\",colts,unicorns\nBehavior,stand,0.5,30,20,0,snails_stand_right.gif,snails_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.5,15,10,2,walk_right.gif,walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/snails/"},
                  {"ini": "Name,Snips\nCategories,\"supporting ponies\",colts,unicorns\nBehavior,stand,0.5,30,20,0,snips_stand_right.gif,snips_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.5,20,15,1.5,snips_walk_right.gif,snips_walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/snips/"},
                  {"ini": "Name,\"Soarin'\"\nCategories,\"supporting ponies\",stallions,pegasi\nBehavior,idle,0.33,20,15,0,idle_right.gif,idle_left.gif,None,,,,False,0,0,,True,,,\"42,40\",\"0,0\",False,0,Fixed\nBehavior,trot,0.33,20,15,3,trot_right.gif,trot_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,fly,0.33,20,15,2,fly_right.gif,fly_left.gif,Diagonal_Vertical,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,pie,0.15,20,15,0,pie_right.gif,pie_left.gif,MouseOver,,,,False,0,0,,True,,,\"42,40\",\"59,40\",False,0,Fixed\nBehavior,wonderbolts,0.1,2.5,2.5,5,fly_right.gif,fly_left.gif,None,wonderbolts_1,,,True,-45,32,Spitfire,False,idle,fly,\"0,0\",\"0,0\",False,0,Mirror\nBehavior,wonderbolts_1,0.25,5,5,18,soaring-fastfly-right.gif,soaring-fastfly-left.gif,Diagonal_horizontal,,,,True,-45,32,Spitfire,False,wonderbolts_1,wonderbolts_1,\"58,52\",\"53,52\",False,0,Mirror\nEffect,stormclouds_2,wonderbolts_1,smoke_trail.gif,smoke_trail.gif,1,0.03,Center,Center,Center,Center,False,False\nSpeak,\"Soundboard #1\",\"As a horse.\",{\"as a horse.mp3\",\"as a horse.ogg\"},False,0\nSpeak,\"Soundboard #2\",\"My pie!\",{\"my pie.mp3\",\"my pie.ogg\"},False,0\nSpeak,\"Soundboard #3\",\"*nom nom nom*\",{\"nom nom nom.mp3\",\"nom nom nom.ogg\"},False,0\nSpeak,\"Soundboard #4\",\"You saved it!\",{\"you saved it.mp3\",\"you saved it.ogg\"},False,0\n", "baseurl": "ponies/soarin%27/"},
                  {"ini": "Name,\"Soigne Folio\"\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.15,15,5,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.15,15,5,3,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,run,0.15,15,5,5,soignerun_right.gif,soignerun_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,follow_photo,1,30,30,3,trot_right.gif,trot_left.gif,All,,,,False,-148,0,\"Photo Finish\",True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/soigne%20folio/"},
                  {"ini": "Name,Sparkler\nCategories,\"supporting ponies\",mares,unicorns\nBehavior,stand,0.4,15,3,0,sparkler_stand_right.gif,sparkler_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"46,42\",\"0,0\",False,0,Fixed\nBehavior,trot,0.3,20,15,2,sparkler_walk_right.gif,sparkler_walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"51,44\",\"47,44\",False,0,Fixed\nBehavior,sitting,0.2,45,30,0,sparkler_sit_right.gif,sparkler_sit_left.gif,Sleep,,,,False,0,0,,True,,,\"31,18\",\"42,18\",False,0,Fixed\nBehavior,jar,0.2,20,15,0,sparkler_jar_open_right.gif,sparkler_jar_open_left.gif,None,,,,False,0,0,,True,,,\"31,20\",\"58,20\",False,0,Fixed\n", "baseurl": "ponies/sparkler/"},
                  {"ini": "Name,Spike\nCategories,\"supporting ponies\",colts,non-ponies\nBehavior,stand,0.1,15,10,0,spike_idle_right.gif,spike_idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"16,28\",\"17,28\",False,0,Fixed\nBehavior,walk,0.15,15,10,2,running_spike_right.gif,running_spike_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"16,30\",\"17,30\",False,0,Fixed\nBehavior,Admire_Rarity_start,0,0.4,0.4,0,spike_love_start_right.gif,spike_love_start_left.gif,None,Admire_Rarity,,,False,0,0,,True,,,\"16,28\",\"25,28\",False,0,Fixed\nBehavior,Admire_Rarity,0,15,10,0,spike_love_right.gif,spike_love_left.gif,None,,,,False,0,0,,True,,,\"19,26\",\"24,26\",False,0,Fixed\nBehavior,Follow_Rarity,0.1,15,10,2,spike_floating_right.gif,spike_floating_left.gif,All,,,,False,-70,-40,Rarity,False,Follow_Rarity,Follow_Rarity,\"32,44\",\"23,44\",False,0,Mirror\nBehavior,door,0.05,10.24,10.24,0,door.gif,door.gif,None,,,,False,0,0,,True,,,\"72,78\",\"72,78\",False,0,Fixed\nBehavior,stand2,0.15,7.52,7.52,0,spike_stand_right.gif,spike_stand_left.gif,None,,,,False,0,0,,True,,,\"19,32\",\"18,32\",False,0,Fixed\nBehavior,moustache_end,0.05,12.76,12.76,0,moustache_stand_right.gif,moustache_stand_left.gif,None,,,,True,0,0,,True,,,\"19,32\",\"26,32\",False,0,Fixed\nBehavior,moustache_1,0.07,0.76,0.76,0,spike_moustache_ready_right.gif,spike_moustache_ready_left.gif,None,moustache_2,,,False,0,0,,True,,,\"16,26\",\"23,26\",False,0,Fixed\nBehavior,moustache_2,0.05,2.6,2.6,0,spike_moustache_magic_right.gif,spike_moustache_magic_left.gif,None,moustache_3,,,True,0,0,,True,,,\"22,24\",\"29,24\",False,0,Fixed\nBehavior,moustache_3,0.05,0.65,0.65,0,spike_moustache_working_right.gif,spike_moustache_working_left.gif,None,moustache_4,,,True,0,0,,True,,,\"19,24\",\"27,24\",False,0,Fixed\nBehavior,moustache_4,0.05,0.8,0.8,0,spike_mustache_twirl_right.gif,spike_mustache_twirl_left.gif,None,moustache_end,,,True,0,0,,True,,,\"19,24\",\"16,24\",False,0,Fixed\nSpeak,\"Unnamed #1\",\"Do I have to?\",,False,0\nSpeak,\"Unnamed #2\",\"Well, well, well...!\",,False,0\nSpeak,\"Unnamed #3\",Ra...Ra...Rarityyyy...,,False,0\nSpeak,\"Unnamed #4\",\"Don't tell anypony, but I have a crush on... Rarity!\",,False,0\nSpeak,\"Soundboard #1\",\"Another donut! Extra sprinkles!\",{\"another donut, extra sprinkles.mp3\",\"another donut, extra sprinkles.ogg\"},False,0\nSpeak,\"Soundboard #2\",\"An outhouse?\",{\"an outhouse.mp3\",\"an outhouse.ogg\"},False,0\nSpeak,\"Soundboard #3\",\"Can you do that? Can you explode twice?\",{\"can you do that, can you explode twice.mp3\",\"can you do that, can you explode twice.ogg\"},False,0\nSpeak,\"Soundboard #4\",\"Whoa! Dude, that's creepy.\",{\"dude, that's creepy.mp3\",\"dude, that's creepy.ogg\"},False,0\nSpeak,\"Soundboard #5\",\"*evil laugh*\",{\"(evil laugh).mp3\",\"(evil laugh).ogg\"},False,0\nSpeak,\"Soundboard #6\",\"Holy guacamole!\",{\"holy guacamole.mp3\",\"holy guacamole.ogg\"},False,0\nSpeak,\"Soundboard #7\",\"How do you know?\",{\"how do you know.mp3\",\"how do you know.ogg\"},False,0\nSpeak,\"Soundboard #8\",\"I can't even work with that.\",{\"i can't even work with that.mp3\",\"i can't even work with that.ogg\"},False,0\nSpeak,\"Soundboard #9\",\"I got nothing.\",{\"i got nothing.mp3\",\"i got nothing.ogg\"},False,0\nSpeak,\"Soundboard #10\",\"Is it... zombies?\",{\"is it zombies.mp3\",\"is it zombies.ogg\"},False,0\nSpeak,\"Soundboard #11\",Nooooooooooooo!,{nooooooooooooo.mp3,nooooooooooooo.ogg},False,0\nSpeak,\"Soundboard #12\",\"Hey! Say it, don't spray it.\",{\"say it, dont spray it.mp3\",\"say it, dont spray it.ogg\"},False,0\nSpeak,\"Soundboard #13\",\"What? What's wrong?\",{\"what, whats wrong.mp3\",\"what, whats wrong.ogg\"},False,0\n", "baseurl": "ponies/spike/"},
                  {"ini": "Name,Spitfire\nCategories,\"supporting ponies\",mares,pegasi\nbehaviorgroup,1,Normal\nbehaviorgroup,2,\"No Suit\"\nBehavior,stand,0.15,10,1,0,spitfire_stand_right.gif,spitfire_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"36,44\",\"0,0\",False,1,Fixed\nBehavior,fly,0.3,5,2,5,spitfire_fly_right.gif,spitfire_fly_left.gif,Diagonal_Vertical,,,,False,0,0,,True,,,\"39,48\",\"0,0\",False,1,Fixed\nBehavior,dash,0.4,5,2,5,spitfire_fly_right.gif,spitfire_fly_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,walk,0.15,5,1,3,spitfire_trotcycle_right.gif,spitfire_trotcycle_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"36,50\",\"35,50\",False,1,Fixed\nBehavior,goggles,0.04,2.5,2.5,0,spitfire_goggles_right.gif,spitfire_goggles_left.gif,None,flight,\"Unnamed #1\",,False,0,0,,True,,,\"46,50\",\"37,50\",False,1,Fixed\nBehavior,flight,0.25,5,4,18,spitfire_dash_right.gif,spitfire_dash_left.gif,Diagonal_horizontal,,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,wonderbolts,0.1,2.5,2.5,0,spitfire_goggles_right.gif,spitfire_goggles_left.gif,None,wonderbolts_1,\"Unnamed #1\",,True,0,0,,True,,,\"46,50\",\"37,50\",False,1,Fixed\nBehavior,wonderbolts_1,0.25,5,5,18,spitfire_dash_right.gif,spitfire_dash_left.gif,Diagonal_horizontal,,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,stand-nosuit,0.15,10,1,0,suitless_spitfire_stand_right.gif,suitless_spitfire_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,2,Fixed\nBehavior,fly-nosuit,0.3,5,2,5,suitless_spitfire_fly_right.gif,suitless_spitfire_fly_left.gif,Diagonal_Vertical,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,2,Fixed\nBehavior,dash-nosuit,0.4,5,2,5,suitless_spitfire_fly_right.gif,suitless_spitfire_fly_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,2,Fixed\nBehavior,walk-nosuit,0.15,5,1,3,suitless_spitfire_trotcycle_right.gif,suitless_spitfire_trotcycle_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"36,50\",\"35,50\",False,2,Fixed\nBehavior,remove-suit,0.01,10.24,10.24,0,spitfire_stand_right.gif,spitfire_stand_left.gif,None,stand-nosuit,,,False,0,0,,False,,,\"36,44\",\"35,44\",False,1,Fixed\nBehavior,get-dressed,0.05,10.24,10.24,0,suitless_spitfire_stand_right.gif,suitless_spitfire_stand_left.gif,None,stand,,,False,0,0,,False,,,\"36,44\",\"35,44\",False,2,Fixed\nEffect,stormclouds,flight,smoke_trail.gif,smoke_trail.gif,1,0.02,Center,Center,Center,Center,False,False\nEffect,stormclouds_2,wonderbolts_1,smoke_trail.gif,smoke_trail.gif,1,0.02,Center,Center,Center,Center,False,False\nSpeak,\"Unnamed #1\",\"Lets go, Wonderbolts!!\",,True,0\nSpeak,\"Unnamed #2\",\"Wanna come hang out with us?\",,False,0\nSpeak,\"Soundboard #1\",\"Hey, I know you!\",{\"hey, i know you.mp3\",\"hey, i know you.ogg\"},False,0\nSpeak,\"Soundboard #2\",\"Looks like your skills saved us again.\",{\"looks like your skills saved us again.mp3\",\"looks like your skills saved us again.ogg\"},False,0\n", "baseurl": "ponies/spitfire/"},
                  {"ini": "Name,Spot\nCategories,non-ponies,stallions,\"supporting ponies\"\nBehavior,stand,0.25,8,6,0,spot_blink_right.gif,spot_blink_left.gif,MouseOver,,,,False,0,0,,False,stand,walk,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.25,8,6,2.15,spot_walk_right.gif,spot_walk_left.gif,Diagonal_horizontal,,,,False,0,0,,False,stand,walk,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,Follow_Rover,0.25,8,6,2.15,spot_walk_right.gif,spot_walk_left.gif,Diagonal_horizontal,,,,False,0,0,Rover,False,stand,walk,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,threat,0.25,8,6,2,spot_threat_right.gif,spot_threat_left.gif,All,,,,True,0,0,Rarity,False,stand,threat,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,cover,0.05,2,2,0,makeitstop_right.gif,makeitstop_left.gif,None,covering,,,False,0,0,,True,,,\"44,45\",\"46,45\",False,0,Fixed\nBehavior,covering,0,4,2,0,makeitstop1_right.gif,makeitstop1_left.gif,None,,,,True,0,0,,True,,,\"25,23\",\"46,23\",False,0,Fixed\nSpeak,Stop,\"Make it stop!\",,True,0\n", "baseurl": "ponies/spot/"},
                  {"ini": "Name,Stella\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,stand,0.01,15,5,0,stand_right.gif,stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"33,46\",\"44,46\",False,0,Fixed\nBehavior,trot,0.01,15,5,3,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,follow_photo,1,3,3,5,stella_speed_right.gif,stella_speed_left.gif,All,,,,False,-86,86,\"Photo Finish\",False,stand,follow_photo,\"0,0\",\"41,32\",False,0,Fixed\nBehavior,follow_photo2,1,30,30,3,trot_right.gif,trot_left.gif,All,,,,False,-86,86,\"Photo Finish\",False,stand,follow_photo2,\"0,0\",\"0,0\",False,0,Fixed\n", "baseurl": "ponies/stella/"},
                  {"ini": "Name,\"Stellar Eclipse\"\nCategories,\"supporting ponies\",stallions,pegasi\nBehavior,stand,0.2,17,7,0,stellareclipse-idle-right.gif,stellareclipse-idle-left.gif,MouseOver,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,trot,0.2,15,6,2.8,stellareclipse-trot-right.gif,stellareclipse-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nSpeak,chicken,\"I'd trade it for an antique chicken.\",,False,0\nSpeak,burger,\"My belly's tellin' me it's time to eat an oat burger.\",,False,0\n", "baseurl": "ponies/stellar%20eclipse/"},
                  {"ini": "Name,\"Steven Magnet\"\nCategories,non-ponies,\"supporting ponies\",stallions\nBehavior,Stand,0.2,20,10,0,stare_right.gif,stare_left.gif,None,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.2,20,8,3,groove_right.gif,groove_left.gif,All,,,,False,0,0,,True,,,\"138,78\",\"141,78\",False,0,Fixed\nBehavior,\"So True\",0.1,1.3,1.3,0,sotrue_right.gif,sotrue_left.gif,None,,\"so true\",,False,0,0,,False,,,\"136,78\",\"135,78\",True,0,Fixed\nSpeak,\"So True\",\"It's so True!\",,True,0\nSpeak,Moustache,\"Oh, my mustache\",,False,0\n", "baseurl": "ponies/steven%20magnet/"},
                  {"ini": "Name,\"Sue Pie\"\nCategories,\"supporting ponies\",mares,\"earth ponies\"\nBehavior,idle,0.5,20,15,0,idle_right.gif,idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,trot,0.5,20,15,2,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,DJ1,0.25,10,8,0,sue6_right.gif,sue6_left.gif,None,,,,True,0,0,,True,,,\"47,60\",\"38,60\",False,0,Fixed\nSpeak,\"full name\",\"Pinkamina Diane Pie!\",,False,0\n", "baseurl": "ponies/sue%20pie/"},
                  {"ini": "Name,\"Sunset Shimmer\"\nCategories,mares,unicorns,\"supporting ponies\"\nBehavior,stand,0.4,15,5,0,sunsetshimmer-idle-right.gif,sunsetshimmer-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"45,46\",\"40,46\",False,0\nBehavior,walk,0.5,15,7,3,sunsetshimmer-right.gif,sunsetshimmer-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"45,50\",\"41,50\",False,0\nBehavior,gallop,0.2,10,5,6,sunsetshimmer-gallop-right.gif,sunsetshimmer-gallop-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"67,44\",\"50,44\",False,0\nBehavior,warp1,0.17,2.5,2.5,0,sunset-teleport-start-right.gif,sunset-teleport-start-left.gif,None,warp2,,,False,0,0,,True,,,\"75,82\",\"78,82\",True,0\nBehavior,warp2,0.05,4,2,8,transit.gif,transit.gif,Diagonal_Vertical,warp3,,,True,0,0,,True,,,\"83,78\",\"83,78\",False,0\nBehavior,warp3,0.05,1.36,1.36,0,sunset-teleport-end-right.gif,sunset-teleport-end-left.gif,None,,,,True,0,0,,True,,,\"75,82\",\"78,82\",True,0\nSpeak,\"Unnamed #1\",\"I am Sunset Shimmer.\",,False,0\nSpeak,\"Unnamed #2\",\"Well, I'm getting around a lot.\",,False,0\nSpeak,\"Unnamed #3\",\"Just what does she see in this Twilight Sparkle?\",,False,0\nSpeak,\"Unnamed #4\",\"Magical pathways, here I come!\",,False,0\nSpeak,\"Unnamed #5\",\"You must be new here.\",,False,0\nSpeak,\"Unnamed #6\",\"I should've become a princess!\",,False,0\nSpeak,\"Unnamed #7\",\"Once was a pony who shone like the sun... \u266a\",,False,0\nSpeak,\"Unnamed #8\",\"I love me some shiny crowns!\",,False,0\nSpeak,\"Unnamed #9\",\"How strange. Everypony looks so familiar.\",,False,0\n", "baseurl": "ponies/sunset%20shimmer/"},
                  {"ini": "Name,\"Suri Polomare\"\nCategories,mares,\"earth ponies\",\"supporting ponies\"\nBehavior,stand,0.3,12,10,0,suri-idle-right.gif,suri-idle-left.gif,None,,,,False,0,0,,True,,,\"45,48\",\"44,48\",False,0,Fixed\nBehavior,walk,0.3,10,5,2.4,suri-trot-right.gif,suri-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"43,50\",\"44,50\",False,0,Fixed\nSpeak,\"Speech 1\",\"I pay an assistant to sew and get coffee, not talk. 'Kay?\",,False,0\nSpeak,\"Speech 2\",\"It's everypony for herself in the big city, m'kay?\",,False,0\nSpeak,\"Speech 3\",\"Hope you realize how fortunate it is to have me as a mentor.\",,False,0\n", "baseurl": "ponies/suri%20polomare/"},
                  {"ini": "Name,Surprise\nCategories,mares,pegasi,\"supporting ponies\"\nbehaviorgroup,1,Normal\nbehaviorgroup,2,\"Wonderbolt Uniform\"\nBehavior,stand,0.1,10,5,0,stand_surprise_right.gif,stand_surprise_left.gif,MouseOver,,,,False,0,0,,True,,,\"49,42\",\"46,42\",False,1,Fixed\nBehavior,walk,0.15,10,5,3,trotcycle_surprise_right.gif,trotcycle_surprise_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"47,46\",\"0,0\",False,1,Fixed\nBehavior,Stalking_Dash,0.05,40,10,2,trotcycle_surprise_right.gif,trotcycle_surprise_left.gif,Horizontal_Only,,,,False,50,50,\"Rainbow Dash\",True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,fly_upside,0.1,10,5,3,fly2_surprise_right.gif,fly2_surprise_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"50,46\",\"0,0\",False,1,Fixed\nBehavior,fly_up,0.1,10,5,3,fly_surprise_right.gif,fly_surprise_left.gif,Vertical_Only,,,,False,0,0,,True,,,\"46,54\",\"45,54\",False,1,Fixed\nBehavior,fly,0.1,10,5,3,fly_surprise_right.gif,fly_surprise_left.gif,All,,,,False,0,0,,True,,,\"46,54\",\"45,54\",False,1,Fixed\nBehavior,hummingbird,0.05,7,5,0,hummingbirdmode_surprise_right.gif,hummingbirdmode_surprise_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,Dance_tongue,0.1,4.5,4.5,0,tonguedance_surprise_right.gif,tonguedance_surprise_left.gif,None,,,,False,0,0,,True,,,\"61,64\",\"60,64\",False,1,Fixed\nBehavior,backtrack,0.07,10,4,1.5,backtrack_surprise_right.gif,backtrack_surprise_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,get-dressed,0.02,8,4,3,fly_surprise_right.gif,fly_surprise_left.gif,Horizontal_Only,uniform_stand,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1,Fixed\nBehavior,uniform_stand,0.2,10,3,0,surprise-idle-right.gif,surprise-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"51,48\",\"38,48\",False,2,Fixed\nBehavior,uniform_fly,0.15,4,1,3,surprise-fly-right.gif,surprise-fly-left.gif,Vertical_Only,,,,False,0,0,,True,,,\"53,54\",\"40,54\",False,2,Fixed\nBehavior,uniform_dash,0.25,8,2,5,surprise-fly-right.gif,surprise-fly-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"53,54\",\"40,54\",False,2,Fixed\nBehavior,uniform_walk,0.2,10,3,3,surprise-trot-right.gif,surprise-trot-left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"51,52\",\"38,52\",False,2,Fixed\nBehavior,undress,0.08,1.5,1.5,0,surprise-change-right.gif,surprise-change-left.gif,None,stand,,,False,0,0,,True,,,\"77,114\",\"70,114\",False,2,Fixed\nBehavior,wonderbolts,0.1,2.5,2.5,5,surprise-fly-right.gif,surprise-fly-left.gif,None,wonderbolts_1,,,True,-90,0,Spitfire,False,uniform_stand,uniform_fly,\"53,54\",\"40,54\",False,0,Mirror\nBehavior,wonderbolts_1,0.25,5,5,18,surprise-fastfly-right.gif,surprise-fastfly-left.gif,Diagonal_horizontal,,,,True,-90,0,Spitfire,False,wonderbolts_1,wonderbolts_1,\"55,52\",\"54,52\",False,2,Mirror\nEffect,stormclouds_2,wonderbolts_1,smoke_trail.gif,smoke_trail.gif,1,0.03,Center,Center,Center,Center,False,False\nSpeak,\"Unnamed #1\",\"Twitchy tail! Twitchy tail!!\",,False,1\nSpeak,\"Unnamed #2\",\"When I was a little filly and the sun was going down~\",,False,1\nSpeak,\"Unnamed #3\",\"All you have to do is take a cup of flour and add it to the mix~\",,False,0\nSpeak,\"Unnamed #4\",\"It's a party!\",,False,0\nSpeak,\"Unnamed #5\",\"Oh the Wonderbolts is the best team for me~\",,False,0\n", "baseurl": "ponies/surprise/"},
                  {"ini": "Name,\"Sweetie Belle\"\nCategories,\"supporting ponies\",fillies,unicorns\nBehavior,stand,0.05,20,10,0,stand_right.gif,stand_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,sit,0.2,15,5,0,sit_right.gif,sit_left.gif,None,,,,False,0,0,,True,,,\"32,30\",\"35,30\",False,0,Fixed\nBehavior,trot,0.15,10,5,2,walk_right.gif,walk_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,gallop,0.15,15,8,4.5,sweetiebelle-gallop-right.gif,sweetiebelle-gallop-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"47,30\",\"46,30\",False,0,Fixed\nBehavior,fly,0.15,10,5,1,fly_right.gif,fly_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,sleep,0.15,10,5,3,fly_right.gif,fly_left.gif,Sleep,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.25,15,5,2,walk_right.gif,walk_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,look,0.1,10,5,0,look_right.gif,look_left.gif,MouseOver,,,,False,0,0,,True,,,\"32,31\",\"37,31\",False,0,Fixed\nBehavior,scoot,0.1,30,10,2,scoot_right.gif,scoot_left.gif,Diagonal_horizontal,,bored,,False,0,0,,True,,,\"50,18\",\"49,18\",False,0,Fixed\nBehavior,happy_jump,0.05,20,15,0.5,happy_jump_right.gif,happy_jump_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"54,48\",\"37,48\",False,0,Fixed\nBehavior,follow_rarity,0.08,60,40,3,walk_right.gif,walk_left.gif,All,,Rarity_s,Rarity_f,False,-10,20,Rarity,False,stand,trot,\"0,0\",\"0,0\",False,0,Mirror\nBehavior,CMC,0,15,15,4,walk_right.gif,walk_left.gif,All,,cmc,,True,40,-10,\"Apple Bloom\",False,stand,trot,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,skip,0.15,14,7,4,sweetie_belle_skipright.gif,sweetie_belle_skipleft.gif,Horizontal_Only,,,,False,0,0,,True,,,\"47,64\",\"46,64\",False,0,Fixed\nSpeak,Bored,\"Ughh! I'm so BORED!\",,True,0\nSpeak,Rarity_s,\"I can help, big sis!\",,True,0\nSpeak,Rarity_f,\"Oh, oh, oh! Maybe I could....just...stand....over here....and watch.\",,True,0\nSpeak,Help,\"Are you sure I can't help?\",,False,0\nSpeak,Hush,\"Hush now, quiet now.\",,False,0\nSpeak,Wonder,\"I wonder how that happened...\",,False,0\nSpeak,CMC,\"CUTIE MARK CRUSADER DESKTOP PONIES!!!\",,True,0\nSpeak,\"Soundboard #1\",\"Dumb fabric!\",{\"dumb fabric.mp3\",\"dumb fabric.ogg\"},False,0\nSpeak,\"Soundboard #2\",Hammer!,{hammer.mp3,hammer.ogg},False,0\nSpeak,\"Soundboard #3\",\"I know this one!\",{\"i know this one.mp3\",\"i know this one.ogg\"},False,0\nSpeak,\"Soundboard #4\",\"Oh my, sounds serious.\",{\"oh my, sounds serious.mp3\",\"oh my, sounds serious.ogg\"},False,0\nSpeak,\"Soundboard #5\",\"\u266a We are the Cutie Mark Crusaders! \u266b\",{singing.mp3,singing.ogg},False,0\nSpeak,\"Soundboard #6\",\"Aww. That was such a sweet story.\",{\"such a sweet story.mp3\",\"such a sweet story.ogg\"},False,0\nSpeak,\"Soundboard #7\",\"That's a great safe idea.\",{\"thats a great safe idea.mp3\",\"thats a great safe idea.ogg\"},False,0\nSpeak,\"Soundboard #8\",\"We could form our own secret society!\",{\"we could form our own secret society.mp3\",\"we could form our own secret society.ogg\"},False,0\nSpeak,\"Soundboard #9\",\"You cannot run from me!\",{\"you cannot run from me.mp3\",\"you cannot run from me.ogg\"},False,0\n", "baseurl": "ponies/sweetie%20belle/"},
                  {"ini": "Name,Tank\nCategories,pets,non-ponies\nBehavior,fly,1,60,60,1,tank_fly_right.gif,tank_fly_left.gif,All,,,,False,-10,-10,\"Rainbow Dash\",True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/tank/"},
                  {"ini": "Name,Thunderlane\nCategories,\"supporting ponies\",stallions,pegasi\nBehavior,stand,0.15,17,13,0,thunderlane_stand_right.gif,thunderlane_stand_left.gif,MouseOver,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"trot wing blink\",0.4,20,16,3,thunderlane_wing_right_blink.gif,thunderlane_wing_left_blink.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,trot,0.2,15,12,3,thunderlane_trot_right.gif,thunderlane_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"trot wing\",0.2,16,13,3,thunderlane_wing_right.gif,thunderlane_wing_left.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"stand wing\",0.2,17,14,0,thunderlane_wing_stand_right.gif,thunderlane_wing_stand_left.gif,None,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"trot blink\",0.2,20,16,3,thunderlane_trot_right_blink.gif,thunderlane_trot_left_blink.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,fly,0.3,20,15,5,thunderlane_fly_right.gif,thunderlane_fly_left.gif,All,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,sit,0.13,18,13,0,thunderlane_sit_right.gif,thunderlane_sit_left.gif,None,,,,False,0,0,,False,,,\"45,20\",\"44,20\",False,0,Fixed\nBehavior,sleep,0.08,46,37,0,thunderlane_sleep_right.gif,thunderlane_sleep_left.gif,Sleep,sit,,,False,0,0,,False,,,\"45,20\",\"40,20\",False,0,Fixed\nBehavior,hover,0.15,7,5,2,thunderlane_fly_right.gif,thunderlane_fly_left.gif,Vertical_Only,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,jogging,0.1,10,10,3,thunderlane_jogging_right.gif,thunderlane_jogging_left.gif,Diagonal_horizontal,panting,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,panting,0.1,3,3,0,thunderlane_panting_right.gif,thunderlane_panting_left.gif,None,\"faster pace\",,,True,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"faster pace\",0.1,4,4,4,thunderlane_jogging_right.gif,thunderlane_jogging_left.gif,Diagonal_horizontal,,,,True,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,follow,0.1,27,16,2.75,thunderlane_wing_right_blink.gif,thunderlane_wing_left_blink.gif,All,,bro,bye,False,-30,0,Rumble,False,\"stand wing\",\"trot wing blink\",\"0,0\",\"0,0\",False,0,Fixed\nBehavior,training,0,10.35,10.35,2,thunderlane_jogging_right.gif,thunderlane_jogging_left.gif,Horizontal_Only,panting,,,True,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nSpeak,\"not me\",\"It wasn't me!\",{\"it wasn't me.mp3\",\"it wasn't me.ogg\"},False,0\nSpeak,cough,\"*cough cough*\",{\"cough, cough.mp3\",\"cough, cough.ogg\"},False,0\nSpeak,bro,\"Hey there little bro!\",,True,0\nSpeak,bye,\"On the flip side bro!\",,True,0\n", "baseurl": "ponies/thunderlane/"},
                  {"ini": "Name,Tirek\nCategories,non-ponies,\"supporting ponies\",stallions\nBehavior,stand,0.2,15,6,0,tirek-idle-right.gif,tirek-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,walk,0.3,10,5,3,tirek-trot-right.gif,tirek-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"71,86\",\"48,86\",False,0,Fixed\nSpeak,\"Unnamed #1\",\"'Is he friend, or is he foe?' the pony wonders.\",,False,0\nSpeak,\"Unnamed #2\",\"How does it feel knowing that every pony will bow to my will and that there is nothing you can do to stop it?\",,False,0\nSpeak,\"Unnamed #3\",\"Give my regards to Cerberus.\",,False,0\nSpeak,\"Unnamed #4\",\"Is this supposed to be humorous?\",,False,0\n", "baseurl": "ponies/tirek/"},
                  {"ini": "Name,Trenderhoof\nCategories,\"supporting ponies\",stallions,unicorns\nBehavior,stand,0.4,14,9,0,trenderhoof-idle-right.gif,trenderhoof-idle-left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.5,10,4,3,trenderhoof-right.gif,trenderhoof-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Speech 1\",\"Please, call me 'Trend'.\",,False,0\nSpeak,\"Speech 2\",\"Well, this is awkward.\",,False,0\nSpeak,\"Speech 3\",\"You can really feel the authenticity.\",,False,0\nSpeak,\"Speech 4\",\"I have such respect for the work ethic of Earth ponies.\",,False,0\nSpeak,\"Speech 5\",\"I take the mundane, the simple, the unappreciated, and I make it relatable.\",,False,0\nSpeak,\"Speech 6\",\"I'm feeling a tad inspired.\",,False,0\n", "baseurl": "ponies/trenderhoof/"},
                  {"ini": "Name,Trixie\nCategories,\"supporting ponies\",mares,unicorns\nbehaviorgroup,1,Normal\nbehaviorgroup,2,\"No Cape\"\nBehavior,stand,0.1,10,5,0,stand_right.gif,stand_left.gif,Sleep,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1\nBehavior,walk,0.25,10,5,3,walking_right.gif,walking_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"56,58\",\"46,58\",False,1\nBehavior,sit,0.1,10,5,0,sit_right.gif,sit_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,1\nBehavior,stand_fireworks,0.05,3,3,0,trixie_fireworks_right.gif,trixie_fireworks_left.gif,MouseOver,,\"soundboard #8\",,False,0,0,,True,,,\"86,74\",\"72,74\",False,1\nBehavior,flowers,0.07,7,5,0,trixie-flowers-right.gif,trixie-flowers-left.gif,None,,,,False,0,0,,True,,,\"56,74\",\"156,74\",True,1\nBehavior,stand-naked,0.2,15,5,0,trixie_naked_stand_rights.gif,trixie_naked_stand_lefts.gif,MouseOver,,,,False,0,0,,True,,,\"50,26\",\"42,26\",False,2\nBehavior,walking-naked,0.3,15,5,3,trixie_naked_trot_right.gif,trixie_naked_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"52,30\",\"42,30\",False,2\nBehavior,take_off_cape,0.01,10.24,10.24,0,stand_right.gif,stand_left.gif,None,stand-naked,,,False,0,0,,False,,,\"48,55\",\"46,55\",False,1\nBehavior,put_on_cape,0.05,10.24,10.24,0,trixie_naked_stand_rights.gif,trixie_naked_stand_lefts.gif,None,stand,,,False,0,0,,False,,,\"50,24\",\"42,24\",False,2\nBehavior,deal_trixie,0.05,3.7,3.5,0,stand_right.gif,stand_left.gif,None,,,,True,0,0,Shopkeeper,True,,,\"0,0\",\"0,0\",True,0\nEffect,fireworks,stand_fireworks,fireworks.gif,fireworks.gif,0,0,Center,Bottom,Center,Bottom,True,False\nSpeak,\"Soundboard #1\",\"Anything you can do, I can do better.\",{\"anything you can do, i can do better.mp3\",\"anything you can do, i can do better.ogg\"},False,0\nSpeak,\"Soundboard #2\",*fanfare*,{fanfare.mp3,fanfare.ogg},False,0\nSpeak,\"Soundboard #3\",\"Well, well, well, it seems we have some neighsayers in the audience.\",{\"it seems we have some neighsayers in the audience.mp3\",\"it seems we have some neighsayers in the audience.ogg\"},False,0\nSpeak,\"Soundboard #4\",\"It's true my enthusiastic little admirers.\",{\"it's true.mp3\",\"it's true.ogg\"},False,0\nSpeak,\"Soundboard #5\",\"Well, come on. Show Trixie what you've got!\",{\"show trixie what you've got.mp3\",\"show trixie what you've got.ogg\"},False,0\nSpeak,\"Soundboard #6\",\"The Great and Powerful Trixie!\",{\"the g and p t.mp3\",\"the g and p t.ogg\"},False,0\nSpeak,\"Soundboard #7\",\"Was there ever any doubt?\",{\"was there ever any doubt.mp3\",\"was there ever any doubt.ogg\"},False,0\nSpeak,\"Soundboard #8\",\"Watch in awe!\",{\"watch in awe.mp3\",\"watch in awe.ogg\"},True,0\n", "baseurl": "ponies/trixie/"},
                  {"ini": "Name,\"Twilight Sparkle (Filly)\"\nCategories,\"main ponies\",fillies,unicorns\nBehavior,stand2,0.1,15,3,0,twilightfilly_stand_right.gif,twilightfilly_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk2,0.15,15,3,2,twilightfilly_walk_right.gif,twilightfilly_walk_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.15,15,3,1,twilightfilly_walk_right.gif,twilightfilly_walk_left.gif,Diagonal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,stand,0.1,15,3,0,twilightfilly_dance_right.gif,twilightfilly_dance_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,huh,Huh?,,False,0\nSpeak,study,\"I'm going to study everything I can about magic!\",,False,0\nSpeak,school,\"I hope to be accepted into Princess Celestia's School for Gifted Unicorns.\",,False,0\nSpeak,\"Soundboard #9\",\"I'm sorry I wasted your time.\",{\"i'm sry i wasted your time.mp3\",\"i'm sry i wasted your time.ogg\"},False,0\n", "baseurl": "ponies/twilight%20sparkle%20%28filly%29/"},
                  {"ini": "Name,\"Twilight Sparkle\"\nCategories,\"main ponies\",mares,unicorns\nBehavior,stand,0.15,15,5,0,stand_twilight_right.gif,stand_twilight_left.gif,MouseOver,,,,False,0,0,,True,,,\"50,34\",\"47,34\",False,0,Fixed\nBehavior,walk,0.2,15,3,3,trotcycle_twilight_right.gif,twilight_trot_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"50,36\",\"47,36\",False,0,Fixed\nBehavior,take_control_walk,0,15,3,3,trotcycle_twilight_right.gif,twilight_trot_left.gif,Diagonal_Vertical,,,,True,0,0,,True,,,\"50,36\",\"47,36\",False,0,Fixed\nBehavior,take_control_walk2,0,15,3,5,trotcycle_twilight_right.gif,twilight_trot_left.gif,Diagonal_Vertical,,,,True,0,0,,True,,,\"50,36\",\"47,36\",False,0,Fixed\nBehavior,warp1,0.2,2.99,2.99,0,teleport_right.gif,teleport_left.gif,None,warp2,,,False,0,0,,True,,,\"62,70\",\"81,70\",True,0,Fixed\nBehavior,warp2,0.05,4,1.5,8,transit.gif,transit.gif,Diagonal_Vertical,warp3,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,warp3,0.05,1.36,1.36,0,arrive_right.gif,arrive_left.gif,None,,,,True,0,0,,True,,,\"72,72\",\"65,72\",True,0,Fixed\nBehavior,Read,0.15,45,20,0,read.gif,read.gif,Sleep,,,,False,0,0,,True,,,\"85,26\",\"85,26\",False,0,Fixed\nBehavior,\"theme 1\",0,7.5,7.5,3,trotcycle_twilight_right.gif,twilight_trot_left.gif,Diagonal_horizontal,\"theme 2\",,\"theme 1\",True,0,0,,True,,,\"50,36\",\"47,36\",False,0,Fixed\nBehavior,\"theme 2\",0,4,4,3,trotcycle_twilight_right.gif,twilight_trot_left.gif,Diagonal_horizontal,\"theme 3\",,\"theme 2\",True,0,0,,True,,,\"50,36\",\"47,36\",False,0,Fixed\nBehavior,\"theme 3\",0,8,8,3,trotcycle_twilight_right.gif,twilight_trot_left.gif,Diagonal_horizontal,\"theme 4\",,\"theme 3\",True,0,0,,True,,,\"50,36\",\"47,36\",False,0,Fixed\nBehavior,\"theme 4\",0,4,4,3,trotcycle_twilight_right.gif,twilight_trot_left.gif,Diagonal_horizontal,\"theme 5\",,,True,0,0,,True,,,\"50,36\",\"47,36\",False,0,Fixed\nBehavior,\"theme 5\",0,3.5,3.5,0,stand_twilight_right.gif,stand_twilight_left.gif,None,,\"theme 4\",,True,0,0,,True,,,\"50,34\",\"47,34\",False,0,Fixed\nBehavior,Galla_Dress,0.01,20,15,0,twilight_galla_right.gif,twilight_galla_left.gif,None,,,,False,0,0,,True,,,\"55,31\",\"48,31\",False,0,Fixed\nBehavior,baloon,0.001,17,10,0.5,twi-balloon-right.gif,twi-balloon-left.gif,All,,,,False,0,0,,True,,,\"151,400\",\"150,400\",False,0,Fixed\nBehavior,truck_twilight,0,3,3,3,trotcycle_twilight_right.gif,twilight_trot_left.gif,None,truck_twilight2,truck1,,True,200,0,Applejack,False,stand,walk,\"50,36\",\"47,36\",False,0,Fixed\nBehavior,truck_twilight2,0,7,7,0,trotcycle_twilight_right.gif,twilight_trot_left.gif,None,truck_twilight3,truck2,,True,0,0,Applejack,False,stand,stand,\"50,36\",\"47,36\",False,0,Fixed\nBehavior,truck_twilight3,0,7,7,0,trotcycle_twilight_right.gif,twilight_trot_left.gif,None,,truck3,truck4,True,0,0,Applejack,False,stand,stand,\"50,36\",\"47,36\",False,0,Fixed\nBehavior,rage,0.1,7.3,7.3,0,twi_rage_right.gif,twi_rage_left.gif,None,,,,False,0,0,,True,,,\"66,154\",\"51,154\",False,0,Fixed\nBehavior,gallop,0.05,15,15,5,twilight_gallop_right.gif,twilight_gallop_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"70,28\",\"59,28\",False,0,Fixed\nBehavior,breakdown,0.02,7,7,0,breakdown_right.gif,breakdown_left.gif,None,,,,False,0,0,,True,,,\"48,38\",\"47,38\",False,0,Fixed\nBehavior,Discorded,0.01,3.55,3.55,0,discorded_right.gif,discorded_left.gif,None,,,,False,0,0,,True,,,\"50,32\",\"47,32\",False,0,Fixed\nBehavior,pinkaport,0,5.5,5.5,0,magic_twilight_right.gif,magic_twilight_left.gif,None,,,,True,0,0,,True,,,\"50,46\",\"61,46\",True,0,Fixed\nBehavior,Twologht,0,10.24,10.24,0,stand_twilight_right.gif,stand_twilight_left.gif,None,,,,True,0,0,,True,,,\"50,34\",\"47,34\",False,0,Fixed\nBehavior,\"Conga Start\",0,5,5,10,twilight_gallop_right.gif,twilight_gallop_left.gif,Diagonal_horizontal,Conga,,,True,0,70,\"Pinkie Pie\",False,stand,gallop,\"71,28\",\"58,28\",False,0,Fixed\nBehavior,Conga,0,30,30,1.2,congatwilight_right.gif,congatwilight_left.gif,Horizontal_Only,,,,True,-42,-1,Rarity,False,stand,Conga,\"47,43\",\"46,43\",False,0,Mirror\nBehavior,Drag,0,4.1,0,0,twilightdrag_right.gif,twilightdrag_left.gif,Dragged,,,,False,0,0,,True,,,\"29,52\",\"32,52\",False,0,Fixed\nBehavior,Flowing_Mane,0.1,8,3,0,windblown_right.gif,windblown_left.gif,None,,,,False,0,0,,False,,,\"32,42\",\"45,42\",False,0,Fixed\nBehavior,ride-start,0,3,3,2,trotcycle_twilight_right.gif,twilight_trot_left.gif,All,ride,,,True,0,0,Owlowiscious,False,stand,walk,\"50,36\",\"47,36\",False,0,Fixed\nBehavior,ride,0.15,30,30,3,twi-owl-right.gif,twi-owl-left.gif,Diagonal_horizontal,,,,True,0,0,,True,,,\"50,38\",\"47,38\",False,0,Fixed\nBehavior,crystallized,0.01,30,15,0,crystallizedtwilight_right.png,crystallizedtwilight_left.png,None,,,,False,0,0,,False,,,\"50,32\",\"47,32\",False,0,Fixed\nBehavior,deal_twi,0.05,3.7,3.5,0,stand_twilight_right.gif,stand_twilight_left.gif,None,,,,True,0,0,Shopkeeper,True,,,\"50,34\",\"47,34\",True,0,Fixed\nBehavior,party_hard,0.05,8,3,0,twilight_partyhard_right.gif,twilight_partyhard_left.gif,None,,,,False,0,0,,True,,,\"50,24\",\"61,24\",False,0,Fixed\nBehavior,starswirl,0.01,24,8,3,twi-starswirl-right.gif,twi-starswirl-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"53,76\",\"54,76\",False,0,Fixed\nBehavior,\"banner start\",0,6,6,3,trotcycle_twilight_right.gif,twilight_trot_left.gif,Diagonal_horizontal,\"banner fit\",,,True,90,5,\"Carrot Top\",False,stand,walk,\"0,0\",\"0,0\",False,0,Mirror\nBehavior,\"banner fit\",0,6,6,0,stand_twilight_right.gif,stand_twilight_left.gif,None,\"banner again\",\"banner name\",,True,89,5,\"Carrot Top\",False,stand,stand,\"0,0\",\"0,0\",False,0,Mirror\nBehavior,\"banner again\",0,5,5,0,stand_twilight_right.gif,stand_twilight_left.gif,None,,\"banner again\",,True,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nEffect,crystalspark,crystallized,sparkle.gif,sparkle.gif,0,0,Center,Center,Center,Center,True,False\nSpeak,\"Unnamed #1\",Spiiiiike?,,False,0\nSpeak,\"Unnamed #2\",\"I should really get back to studying...\",,False,0\nSpeak,\"Unnamed #3\",\"Cross my heart and hope to fly, stick a cupcake in my-- OW!\",,False,0\nSpeak,\"Theme 1\",\"I used to wonder what friendship could be!\",,True,0\nSpeak,\"Theme 2\",\"Until you all shared its magic with me!\",,True,0\nSpeak,\"Theme 3\",\"And magic makes it all complete!\",,True,0\nSpeak,\"Theme 4\",\"Do you know you're all my very best friends?\",,True,0\nSpeak,truck1,\"What in the hay!?\",,True,0\nSpeak,Truck2,\"Applejack, what in the wide, wide world of Equestria is THAT?\",,True,0\nSpeak,Truck3,\"And why is there a cardboard cutout of ME in the back???\",,True,0\nSpeak,Truck4,\"What? Ugh...\",,True,0\nSpeak,\"Soundboard #1\",\"Ah, hello?\",{\"ah, hello.mp3\",\"ah, hello.ogg\"},False,0\nSpeak,\"Soundboard #2\",\"All the ponies in this town are CRAZY!\",{\"all the ponies in this town are crazy.mp3\",\"all the ponies in this town are crazy.ogg\"},False,0\nSpeak,\"Soundboard #3\",\"Are you crazy?\",{\"are you crazy.mp3\",\"are you crazy.ogg\"},False,0\nSpeak,\"Soundboard #4\",\"Dear Princess Celestia...\",{\"dear princess celestia.mp3\",\"dear princess celestia.ogg\"},False,0\nSpeak,\"Soundboard #5\",\"Ooh! Doesn't that hurt?\",{\"doesn't that hurt.mp3\",\"doesn't that hurt.ogg\"},False,0\nSpeak,\"Soundboard #6\",\"We'll do everything by the book!\",{\"do everything by the book.mp3\",\"do everything by the book.ogg\"},False,0\nSpeak,\"Soundboard #7\",\"Good afternoon! My name is Twilight Sparkle.\",{\"good afternoon, my name....mp3\",\"good afternoon, my name....ogg\"},False,0\nSpeak,\"Soundboard #8\",\"I don't get it.\",{\"i don't get it.mp3\",\"i don't get it.ogg\"},False,0\nSpeak,\"Soundboard #10\",\"I uh, I think I hear my laundry calling! Sorry, gotta go.\",{\"i think i hear my laundry calling, sry gotta go.mp3\",\"i think i hear my laundry calling, sry gotta go.ogg\"},False,0\nSpeak,\"Soundboard #11\",\"It's the perfect plan!\",{\"it's the perfect plan.mp3\",\"it's the perfect plan.ogg\"},False,0\nSpeak,\"Soundboard #12\",\"Look out! Here comes Tom!\",{\"look out here comes tom.mp3\",\"look out here comes tom.ogg\"},False,0\nSpeak,\"Soundboard #13\",More?,{more.mp3,more.ogg},False,0\nSpeak,\"Soundboard #14\",\"My little ponies!\",{\"my little ponies.mp3\",\"my little ponies.ogg\"},False,0\nSpeak,\"Soundboard #15\",\"No excuses!\",{\"no excuses.mp3\",\"no excuses.ogg\"},False,0\nSpeak,\"Soundboard #16\",\"No, really?\",{\"no rly.mp3\",\"no rly.ogg\"},False,0\nSpeak,\"Soundboard #17\",\"Oh no! Nonononono-no-NO! This is bad!\",{\"oh no, this is bad.mp3\",\"oh no, this is bad.ogg\"},False,0\nSpeak,\"Soundboard #18\",\"You told me it was all an old pony tale.\",{\"old pony tale.mp3\",\"old pony tale.ogg\"},False,0\nSpeak,\"Soundboard #19\",\"Pardon me, Princess.\",{\"pardon me princess.mp3\",\"pardon me princess.ogg\"},False,0\nSpeak,\"Soundboard #20\",\"Please don't hate me!\",{\"pls dont hate me.mp3\",\"pls dont hate me.ogg\"},False,0\nSpeak,\"Soundboard #21\",\"Prove it.\",{\"prove it.mp3\",\"prove it.ogg\"},False,0\nSpeak,\"Soundboard #22\",\"This is MY book! And I'm gonna READ IT!\",{\"this is my book and im gonna read it.mp3\",\"this is my book and im gonna read it.ogg\"},False,0\nSpeak,\"Soundboard #23\",\"Ehehaha... This is no joke.\",{\"this is no joke.mp3\",\"this is no joke.ogg\"},False,0\nSpeak,\"Soundboard #24\",\"Tough love, baby!\",{\"tough love, baby.mp3\",\"tough love, baby.ogg\"},False,0\nSpeak,\"Soundboard #25\",\"Wow. Catchy.\",{\"wow catchy.mp3\",\"wow catchy.ogg\"},False,0\nSpeak,\"Soundboard #26\",Yesyesyesyesyesyesyesyesyesyesyesyesyesyesyesyes!,{yesyesyes.mp3,yesyesyes.ogg},False,0\nSpeak,\"Soundboard #27\",\"Your faithful student, Twilight Sparkle.\",{\"your faithful student....mp3\",\"your faithful student....ogg\"},False,0\nSpeak,\"banner name\",\"What happened to the rest of her name?\",,True,0\nSpeak,\"banner again\",\"We can't hang a banner that says 'Welcome Princess Celest'! Take it down and try again.\",,True,0\n", "baseurl": "ponies/twilight%20sparkle/"},
                  {"ini": "Name,Twinkleshine\nCategories,\"supporting ponies\",mares,unicorns\nBehavior,stand,0.2,20,16,0,twinkleshine_stand_right.gif,twinkleshine_stand_left.gif,MouseOver,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,trot,0.18,15,13,3,twinkleshine_trot_right.gif,twinkleshine_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,\"trot blink\",0.24,24,19,3,twinkleshine_trot_right_blink.gif,twinkleshine_trot_left_blink.gif,Diagonal_horizontal,,,,False,0,0,,False,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,sit,0.16,18,15,0,twinkleshine_sit_right.gif,twinkleshine_sit_left.gif,None,,,,False,0,0,,False,,,\"46,16\",\"33,16\",False,0,Fixed\nBehavior,sleep,0.13,43,39,0,twinkleshine_sleep_right.gif,twinkleshine_sleep_left.gif,Sleep,sit,,,False,0,0,,False,,,\"46,18\",\"27,18\",False,0,Fixed\nSpeak,\"wanna come?\",\"Moondancer is having a little get-together at the west castle courtyard. You wanna come? \",{\"wanna come.mp3\",\"wanna come.ogg\"},False,0\nSpeak,dresses,\"I think they're lovely.\",{\"i think they're lovely!.mp3\",\"i think they're lovely!.ogg\"},False,0\nSpeak,study?,\"Does that pony do anything except study?\",{\"does that pony do anything except study.mp3\",\"does that pony do anything except study.ogg\"},False,0\nSpeak,\"books than friends\",\"I think she's more interested in books than friends.\",{\"more interested in books than friends.mp3\",\"more interested in books than friends.ogg\"},False,0\n", "baseurl": "ponies/twinkleshine/"},
                  {"ini": "Name,Twist\nCategories,fillies,\"supporting ponies\",\"earth ponies\"\nBehavior,idle,0.5,20,15,0,idle_right.gif,idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.5,20,15,2,trot_right.gif,trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Soundboard #1\",\"Isn't my cutie mark swell?\",{\"isnt my cutiemark swell.mp3\",\"isnt my cutiemark swell.ogg\"},False,0\n", "baseurl": "ponies/twist/"},
                  {"ini": "Name,\"Uncle Orange\"\nCategories,\"supporting ponies\",stallions,\"earth ponies\"\nBehavior,stand,0.5,20,7.52,0,orange_stand_right.gif,orange_stand_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.5,30,20,3,orange_trot_right.gif,orange_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/uncle%20orange/"},
                  {"ini": "Name,\"Vinyl Scratch\"\nCategories,\"supporting ponies\",mares,unicorns\nBehavior,stand,0.1,3,1,0,idle_scratch_right.gif,idle_scratch_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,standsmile,0.1,3,1,0,idle_smile_scratch_right.gif,idle_smile_scratch_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,standstrobe1,0.2,3,1,0,idle_strobe1_scratch_right.gif,idle_strobe1_scratch_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,standstrobe2,0.2,3,1,0,idle_strobe2_scratch_right.gif,idle_strobe2_scratch_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,standstrobe3,0.2,3,1,0,idle_strobe3_scratch_right.gif,idle_strobe3_scratch_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,DJ1,0.35,1,1,1,dancestomp_scratch_right.gif,dancestomp_scratch_left.gif,MouseOver,DJ1a,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,DJ1a,0.01,6,4,1,dancestomp_scratch_right.gif,dancestomp_scratch_left.gif,None,DJ2,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,DJ2,0.01,4,1,1,dancestomp_strobe1_scratch_right.gif,dancestomp_strobe1_scratch_left.gif,None,DJ3,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,DJ3,0.01,2,1,1,dancestomp_strobe2_scratch_right.gif,dancestomp_strobe2_scratch_left.gif,None,DJ4,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,DJ4,0.01,1,1,1,dancestomp_strobe3_scratch_right.gif,dancestomp_strobe3_scratch_left.gif,None,,,,True,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.2,15,10,2,trotcycle_scratch_right.gif,trotcycle_scratch_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,moonwalk,0.1,5,2,2,moonwalk_scratch_right.gif,moonwalk_scratch_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,fly,0.1,5,2,2,updown_scratch_right.gif,updown_scratch_left.gif,Diagonal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nEffect,discpopup,DJ1,djdecks_popup_right.gif,djdecks_popup_left.gif,0,0,Right,Center,Left,Center,True,False\nEffect,discplay1,DJ1a,djdecks_playing_right.gif,djdecks_playing_left.gif,0,0,Right,Center,Left,Center,True,False\nEffect,discplay2,DJ2,djdecks_playing_strobe1_right.gif,djdecks_playing_strobe1_left.gif,0,0,Right,Center,Left,Center,True,False\nEffect,discplay3,DJ3,djdecks_playing_strobe2_right.gif,djdecks_playing_strobe2_left.gif,0,0,Right,Center,Left,Center,True,False\nEffect,discplay4,DJ4,djdecks_playing_strobe3_right.gif,djdecks_playing_strobe3_left.gif,0,0,Right,Center,Left,Center,True,False\nSpeak,\"Unnamed #1\",\"Catch the beat!\",,False,0\nSpeak,\"Unnamed #2\",\"Let's party!\",,False,0\nSpeak,\"Unnamed #3\",\"\u201c*UNTS UNTS UNTS UNTS*\u201d\",,False,0\nSpeak,\"Unnamed #4\",\"Feel the beat!\",,False,0\n", "baseurl": "ponies/vinyl%20scratch/"},
                  {"ini": "Name,Violet\nCategories,\"supporting ponies\",mares,unicorns\nBehavior,stand,0.3,15,3,0,violet_stand_right.gif,violet_stand_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0,Fixed\nBehavior,trot,0.3,20,15,2,violet_trot_right.gif,violet_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"52,44\",\"43,44\",False,0,Fixed\nBehavior,sit,0.2,30,20,0,violet_sit_right.gif,violet_sit_left.gif,None,,,,False,0,0,,True,,,\"38,16\",\"37,16\",False,0,Fixed\nBehavior,sit2,0.2,30,20,0,violet_sit_up_right.gif,violet_sit_up_left.gif,None,,,,False,0,0,,True,,,\"37,32\",\"36,32\",False,0,Fixed\nBehavior,applaud,0.25,10,10,0,violet_tea_right.gif,violet_tea_left.gif,Sleep,,,,False,0,0,,True,,,\"37,34\",\"58,34\",False,0,Fixed\nBehavior,drag,0,2.4,0.1,0,violet_safe_drag_left.gif,violet_safe_drag_right.gif,Dragged,,,,True,0,0,,True,,,\"15,26\",\"74,26\",False,0,Fixed\nBehavior,mouseover,0.01,5.2,2,0,violet_mouse_left.gif,violet_mouse_right.gif,MouseOver,,,,False,0,0,,True,,,\"17,30\",\"42,30\",False,0,Fixed\n", "baseurl": "ponies/violet/"},
                  {"ini": "Name,Walter\nCategories,stallions,\"earth ponies\",\"supporting ponies\"\nBehavior,stand,0.2,15,3,0,walter-idle-right.gif,walter-idle-left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walking,0.35,15,5,2,walter-trot-right.gif,walter-trot-left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nSpeak,\"Speech #1\",\"You're entering a world of pain.\",,False,0\nSpeak,\"Speech #2\",\"A world of pain!\",,False,0\nSpeak,\"Speech #3\",\"Am I wrong?\",,False,0\nSpeak,\"Speech #4\",Amateurs.,,False,0", "baseurl": "ponies/walter/"},
                  {"ini": "Name,\"Wild Fire\"\nCategories,\"supporting ponies\",mares,pegasi\nBehavior,stand,0.6,20,15,0,wild_fire_idle_right.gif,wild_fire_idle_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,trot,0.5,20,15,2,wild_fire_trot_right.gif,wild_fire_trot_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,fly,0.5,20,15,3,wild_fire_flight_right.gif,wild_fire_flight_left.gif,All,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,hover,0.4,20,10,0.5,wild_fire_annoyed_right.gif,wild_fire_annoyed_left.gif,Diagonal_Vertical,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/wild%20fire/"},
                  {"ini": "Name,Winona\nCategories,pets\nBehavior,mouseover,0.1,15,10,0,winona_stand_right.gif,winona_stand_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,run,0.2,20,5,6,winona_run_right.gif,winona_run_left.gif,Diagonal_horizontal,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,follow_applejack,0.08,20,10,6,winona_run_right.gif,winona_run_left.gif,All,follow_applejack2,,,False,67,75,Applejack,False,stand,follow_applejack,\"0,0\",\"0,0\",False,0\nBehavior,follow_applejack2,0,20,10,6,winona_run_right.gif,winona_run_left.gif,All,follow_applejack3,,,False,-67,75,Applejack,False,stand,follow_applejack,\"0,0\",\"0,0\",False,0\nBehavior,follow_applejack3,0,20,10,6,winona_run_right.gif,winona_run_left.gif,All,follow_applejack4,,,False,67,75,Applejack,False,stand,follow_applejack,\"0,0\",\"0,0\",False,0\nBehavior,follow_applejack4,0,20,10,6,winona_run_right.gif,winona_run_left.gif,All,follow_applejack5,,,False,-67,75,Applejack,False,stand,follow_applejack,\"0,0\",\"0,0\",False,0\nBehavior,follow_applejack5,0,20,10,6,winona_run_right.gif,winona_run_left.gif,All,follow_applejack6,,,False,67,75,Applejack,False,stand,follow_applejack,\"0,0\",\"0,0\",False,0\nBehavior,follow_applejack6,0,20,10,6,winona_run_right.gif,winona_run_left.gif,All,,,,False,-67,75,Applejack,False,stand,follow_applejack,\"0,0\",\"0,0\",False,0\nBehavior,follow_angel,0.05,20,10,6,winona_run_right.gif,winona_run_left.gif,All,follow_applejack2,,,False,67,75,Applejack,False,stand,follow_applejack,\"0,0\",\"0,0\",False,0\nBehavior,follow_applejack12,0.08,20,10,6,winona_run_right.gif,winona_run_left.gif,All,follow_applejack2,,,False,-67,75,Applejack,False,stand,follow_applejack,\"0,0\",\"0,0\",False,0\nBehavior,follow_applejack22,0,20,10,6,winona_run_right.gif,winona_run_left.gif,All,follow_applejack3,,,False,67,75,Applejack,False,stand,follow_applejack,\"0,0\",\"0,0\",False,0\nBehavior,follow_applejack32,0,20,10,6,winona_run_right.gif,winona_run_left.gif,All,follow_applejack4,,,False,-67,75,Applejack,False,stand,follow_applejack,\"0,0\",\"0,0\",False,0\nBehavior,follow_applejack42,0,20,10,6,winona_run_right.gif,winona_run_left.gif,All,follow_applejack5,,,False,67,75,Applejack,False,stand,follow_applejack,\"0,0\",\"0,0\",False,0\nBehavior,follow_applejack52,0,20,10,6,winona_run_right.gif,winona_run_left.gif,All,follow_applejack6,,,False,-67,75,Applejack,False,stand,follow_applejack,\"0,0\",\"0,0\",False,0\nBehavior,follow_applejack62,0,20,10,6,winona_run_right.gif,winona_run_left.gif,All,,,,False,67,75,Applejack,False,stand,follow_applejack,\"0,0\",\"0,0\",False,0\nBehavior,follow_angel12,0.05,20,10,6,winona_run_right.gif,winona_run_left.gif,All,follow_applejack2,,,False,-67,75,Applejack,False,stand,follow_applejack,\"0,0\",\"0,0\",False,0\nBehavior,stand,0.1,10,4,0,winona_stand_right.gif,winona_stand_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\n", "baseurl": "ponies/winona/"},
                  {"ini": "Name,Zecora\nCategories,mares,\"supporting ponies\",non-ponies\nBehavior,stand,0.2,15,5,0,stand_zecora_right.gif,stand_zecora_left.gif,MouseOver,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk,0.35,15,5,3,trotcycle_zecora_right.gif,trotcycle_zecora_left.gif,Horizontal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,walk_diag,0.25,10,5,3,trotcycle_zecora_right.gif,trotcycle_zecora_left.gif,Diagonal_Only,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,dig,0.2,15,3,0,dig_zecora_right.gif,dig_zecora_left.gif,None,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,balance,0.1,15,5,0,balance_zecora.gif,balance_zecora.gif,Sleep,,,,False,0,0,,True,,,\"0,0\",\"0,0\",False,0\nBehavior,follow_applebloom,0.05,60,60,3,trotcycle_zecora_right.gif,trotcycle_zecora_left.gif,All,,,,False,-66,-39,\"Apple Bloom\",True,,,\"0,0\",\"0,0\",False,0\nBehavior,deal_zecora,0.05,3.7,3.5,0,stand_zecora_right.gif,stand_zecora_left.gif,None,,,,True,0,0,Shopkeeper,True,,,\"45,-20\",\"28,-20\",True,0\nEffect,joke,dig,joke.png,joke.png,0,0,Any-Not_Center,Any-Not_Center,Any-Not_Center,Any-Not_Center,False,False\nSpeak,\"Unnamed #2\",\"Those leaves of blue are not a joke.\",,False,0\nSpeak,\"Soundboard #1\",\"Beware! BEWARE!\",{beware.mp3,beware.ogg},False,0\nSpeak,\"Soundboard #2\",\"Have you gone mad?\",{\"have you gone mad.mp3\",\"have you gone mad.ogg\"},False,0\nSpeak,\"Soundboard #3\",\"How dare you!\",{\"how dare you.mp3\",\"how dare you.ogg\"},False,0\nSpeak,\"Soundboard #4\",\"Is that a parasprite before my eyes?\",{parasprite.mp3,parasprite.ogg},False,0\nSpeak,\"Soundboard #5\",\"Your actions will make my anger explode!\",{\"your actions will make my anger explode.mp3\",\"your actions will make my anger explode.ogg\"},False,0\nSpeak,\"Soundboard #6\",\"You're doomed.\",{\"you're doomed.mp3\",\"you're doomed.ogg\"},False,0\n", "baseurl": "ponies/zecora/"}
              ]
        };
        
        BrowserPonies.loadConfig(BrowserPoniesConfig);
    };
    $(document).ready(function() {
        htmlViewerEenahps();
    });
}(window.jQuery));
