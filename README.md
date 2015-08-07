[![Build Status](https://travis-ci.org/netzkolchose/node-ansiparser.svg?branch=master)](https://travis-ci.org/netzkolchose/node-ansiparser)
[![Coverage Status](https://coveralls.io/repos/netzkolchose/node-ansiparser/badge.svg?branch=master)](https://coveralls.io/r/netzkolchose/node-ansiparser?branch=master)

A parser for ANSI escape code sequences. It implements the parser described here
http://vt100.net/emu/dec_ansi_parser (thanks to Paul Williams).

**NOTE ON UNICODE:** The parser works with unicode strings. High unicode characters (any above C1)
are only allowed within the string consuming states GROUND (for print), OSC_STRING and DCS_PASSTHROUGH.
At any other state they will either be ignored (CSI_IGNORE and DCS_IGNORE)
or cancel the active escape sequence. Although this doesn't follow any official specification
(since I haven't found any) it seems to work with unicode terminal streams.

The parser uses callbacks to methods of a given terminal object.
Methods a terminal should implement:

* inst_p(s)                         *print string s*
* inst_o(s)                         *osc call*
* inst_x(flag)                      *trigger one char method*
* inst_c(collected, params, flag)   *trigger csi method*
* inst_e(collected, flag)           *trigger esc method*
* inst_H(collected, params, flag)   *dcs command (hook)*
* inst_P(data)                      *dcs put*
* inst_U()                          *dcs unhook*

**NOTE:** If the terminal object doesn't provide the needed methods the parser
will inject dummy methods to keep working.

## Methods

* parse(s)  *parse the given string and call the terminal methods*
* reset()   *reset the parser*

## Usage example
This example uses a simple terminal object, which just logs the actions:
```javascript
var AnsiParser = require('node-ansiparser');

var terminal = {
    inst_p: function(s) {console.log('print', s);},
    inst_o: function(s) {console.log('osc', s);},
    inst_x: function(flag) {console.log('execute', flag.charCodeAt(0));},
    inst_c: function(collected, params, flag) {console.log('csi', collected, params, flag);},
    inst_e: function(collected, flag) {console.log('esc', collected, flag);},
    inst_H: function(collected, params, flag) {console.log('dcs-Hook', collected, params, flag);},
    inst_P: function(dcs) {console.log('dcs-Put', dcs);},
    inst_U: function() {console.log('dcs-Unhook');}
};


var parser = new AnsiParser(terminal);
parser.parse('\x1b[31mHello World!\n');
parser.parse('\x1bP0!u%5\x1b\'');
```
For a more complex terminal see [node-ansiterminal](https://github.com/netzkolchose/node-ansiterminal).

## Known Issues

* DEL (0x7f) is not handled at all at the moment (basically making the parser only up to VT220 compatible).
* No error propagation, all errors will silently reset the parser and continue with the next character.